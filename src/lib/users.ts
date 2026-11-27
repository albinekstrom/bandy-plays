/* Accounts: a name in small letters and a password (scrypt hash).
   Neon when DATABASE_URL is set, otherwise .data/users.json (dev only). */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const NAME_RE = /^[a-zåäö]{2,20}$/;
export const MIN_PASSWORD = 8;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await scrypt(pw, salt, 64)).toString("base64")}`;
}
export async function checkPassword(pw: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(got, want);
}

interface UserStore {
  count(): Promise<number>;
  names(): Promise<string[]>;
  hash(name: string): Promise<string | null>;
  /** false if the name is taken */
  add(name: string, hash: string): Promise<boolean>;
  setHash(name: string, hash: string): Promise<void>;
}

const FILE = join(process.cwd(), ".data", "users.json");
type Rec = { name: string; hash: string };
async function readAll(): Promise<Rec[]> { try { return JSON.parse(await readFile(FILE, "utf8")); } catch { return []; } }
async function writeAll(u: Rec[]) { await mkdir(join(process.cwd(), ".data"), { recursive: true }); await writeFile(FILE, JSON.stringify(u, null, 1)); }

const fileStore: UserStore = {
  async count() { return (await readAll()).length; },
  async names() { return (await readAll()).map(u => u.name).sort(); },
  async hash(name) { return (await readAll()).find(u => u.name === name)?.hash ?? null; },
  async add(name, hash) {
    const all = await readAll();
    if (all.some(u => u.name === name)) return false;
    all.push({ name, hash });
    await writeAll(all);
    return true;
  },
  async setHash(name, hash) {
    const all = await readAll();
    const u = all.find(x => x.name === name);
    if (u) { u.hash = hash; await writeAll(all); }
  },
};

function neonStore(url: string): UserStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= sql`
    CREATE TABLE IF NOT EXISTS users (
      name text PRIMARY KEY,
      hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.catch(e => { ready = null; throw e; }));
  return {
    async count() { await init(); return Number(((await sql`SELECT count(*)::int AS n FROM users`) as { n: number }[])[0].n); },
    async names() { await init(); return ((await sql`SELECT name FROM users ORDER BY name`) as { name: string }[]).map(r => r.name); },
    async hash(name) { await init(); return ((await sql`SELECT hash FROM users WHERE name = ${name}`) as { hash: string }[])[0]?.hash ?? null; },
    async add(name, hash) {
      await init();
      return ((await sql`INSERT INTO users (name, hash) VALUES (${name}, ${hash}) ON CONFLICT DO NOTHING RETURNING name`) as unknown[]).length > 0;
    },
    async setHash(name, hash) { await init(); await sql`UPDATE users SET hash = ${hash} WHERE name = ${name}`; },
  };
}

let chosen: UserStore | null = null;
export function users(): UserStore {
  return (chosen ??= process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : fileStore);
}
