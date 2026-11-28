/* Failed-attempt counters for login, sign-up (team code) and password checks.
   Neon when DATABASE_URL is set, otherwise .data/attempts.json (dev only),
   so it works on Vercel without new infrastructure.

   A key (e.g. "login:name:erik" or "login:ip:<hash>") may fail `limit` times
   within WINDOW; after that it is locked for 1 min, then 2, 4, 8, at most 15
   (backoff). Attempts while locked are refused without checking the password
   and are not counted, so a locked key frees itself. */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { headers } from "next/headers";
import { readJson, writeJson, locked } from "./jsonfile";

const WINDOW = 15 * 60; // seconds: a failure older than this starts the count over
const MAX_LOCK = 15 * 60;

export const LIMITS = {
  /** per account name: a person mistyping */
  name: 5,
  /** per IP: a whole team can sit behind one rink wifi */
  ip: 20,
} as const;

export const TOO_MANY = "För många försök. Vänta en stund och försök igen.";

type Rec = { fails: number; last: number }; // last = unix seconds of the latest failure

/** Seconds left of the lock, 0 when free. Pure, so it can be tested. */
export function lockLeft(r: Rec | null | undefined, limit: number, now = Date.now() / 1000) {
  if (!r || now - r.last > WINDOW || r.fails < limit) return 0;
  const lock = Math.min(60 * 2 ** (r.fails - limit), MAX_LOCK);
  return Math.max(0, Math.ceil(r.last + lock - now));
}

interface AttemptStore {
  get(keys: string[]): Promise<Record<string, Rec>>;
  fail(keys: string[]): Promise<void>;
  clear(keys: string[]): Promise<void>;
}

const FILE = join(process.cwd(), ".data", "attempts.json");
const readAll = () => readJson<Record<string, Rec>>(FILE, {});

const fileStore: AttemptStore = {
  async get(keys) {
    const all = await readAll();
    return Object.fromEntries(keys.filter(k => all[k]).map(k => [k, all[k]]));
  },
  fail(keys) {
    return locked(FILE, async () => {
      const all = await readAll(), now = Date.now() / 1000;
      for (const k of keys) {
        const r = all[k];
        all[k] = r && now - r.last <= WINDOW ? { fails: r.fails + 1, last: now } : { fails: 1, last: now };
      }
      for (const k of Object.keys(all)) if (now - all[k].last > WINDOW) delete all[k];
      await writeJson(FILE, all);
    });
  },
  clear(keys) {
    return locked(FILE, async () => {
      const all = await readAll();
      if (!keys.some(k => k in all)) return;
      for (const k of keys) delete all[k];
      await writeJson(FILE, all);
    });
  },
};

function neonStore(url: string): AttemptStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= sql`
    CREATE TABLE IF NOT EXISTS auth_attempts (
      key text PRIMARY KEY,
      fails integer NOT NULL,
      last_fail timestamptz NOT NULL
    )`.catch(e => { ready = null; throw e; }));
  return {
    async get(keys) {
      await init();
      const rows = (await sql`
        SELECT key, fails, extract(epoch FROM last_fail)::float8 AS last
        FROM auth_attempts WHERE key = ANY(${keys})`) as { key: string; fails: number; last: number }[];
      return Object.fromEntries(rows.map(r => [r.key, { fails: r.fails, last: r.last }]));
    },
    async fail(keys) {
      await init();
      // one statement per key, so concurrent failures all count
      for (const k of keys) {
        await sql`
          INSERT INTO auth_attempts (key, fails, last_fail) VALUES (${k}, 1, now())
          ON CONFLICT (key) DO UPDATE SET
            fails = CASE WHEN auth_attempts.last_fail < now() - make_interval(secs => ${WINDOW}) THEN 1 ELSE auth_attempts.fails + 1 END,
            last_fail = now()`;
      }
      await sql`DELETE FROM auth_attempts WHERE last_fail < now() - interval '1 day'`;
    },
    async clear(keys) { await init(); await sql`DELETE FROM auth_attempts WHERE key = ANY(${keys})`; },
  };
}

let chosen: AttemptStore | null = null;
const attempts = () => (chosen ??= process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : fileStore);

/** The caller's IP, hashed (we only need to tell callers apart, not store who they are). */
export async function clientKey() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  return createHash("sha256").update("bp-ip:" + ip).digest("hex").slice(0, 32);
}

export type Guard = { key: string; limit: number };

/** A gate for one kind of attempt: refuse while any key is locked, count failures, forget on success. */
export async function gate(guards: Guard[]) {
  const store = attempts();
  const recs = await store.get(guards.map(g => g.key));
  const wait = Math.max(0, ...guards.map(g => lockLeft(recs[g.key], g.limit)));
  return {
    /** seconds until the next try is allowed, 0 if allowed now */
    wait,
    fail: () => store.fail(guards.map(g => g.key)),
    /** clear only these keys (e.g. the account name, not the shared IP) */
    clear: (keys: string[]) => store.clear(keys),
  };
}

/** Forget everything about an account name (when the account is removed). */
export async function forgetName(name: string) {
  await attempts().clear(["login:name:" + name, "pw:name:" + name]);
}
