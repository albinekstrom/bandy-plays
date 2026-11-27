/* Where plays are kept: Neon Postgres when DATABASE_URL is set,
   otherwise a local JSON file (dev only; Vercel's disk is read-only). */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { join } from "node:path";
import { readJson, writeJson, locked } from "./jsonfile";
import type { Play, PlayData, PlaySummary } from "./types";
import { upgrade } from "./schema";

export interface PlayStore {
  list(): Promise<PlaySummary[]>;
  get(id: string): Promise<Play | null>;
  create(name: string, data: PlayData): Promise<Play>;
  /** rev: the revision the edit builds on; if the play was saved since, nothing is written ("conflict"). */
  update(id: string, name: string, data: PlayData, rev?: number): Promise<Play | null | "conflict">;
  remove(id: string): Promise<void>;
  /** Set (token) or revoke (null) the read-only share link. */
  share(id: string, token: string | null): Promise<void>;
  byShare(token: string): Promise<Play | null>;
  /** Returns false when the play does not exist. */
  setTags(id: string, tags: string[]): Promise<boolean>;
}

const FILE = join(process.cwd(), ".data", "plays.json");

const readAll = () => readJson<Play[]>(FILE, []);
const writeAll = (plays: Play[]) => writeJson(FILE, plays);

const fileStore: PlayStore = {
  async list() {
    return (await readAll())
      .map(({ id, name, updatedAt, tags }) => ({ id, name, updatedAt, tags: tags ?? [] }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    const p = (await readAll()).find(x => x.id === id);
    return p ? { ...p, ...upgrade(p) } : null;
  },
  async create(name, data) {
    return locked(FILE, async () => {
      const plays = await readAll();
      const play: Play = { id: crypto.randomUUID(), name, updatedAt: new Date().toISOString(), ...data };
      plays.push(play);
      await writeAll(plays);
      return play;
    });
  },
  async update(id, name, data, rev) {
    return locked(FILE, async () => {
      const plays = await readAll();
      const i = plays.findIndex(p => p.id === id);
      if (i < 0) return null;
      const cur = plays[i].revision ?? 0;
      if (rev !== undefined && rev !== cur) return "conflict";
      plays[i] = { ...plays[i], ...data, id, name, updatedAt: new Date().toISOString(), revision: cur + 1 };
      await writeAll(plays);
      return plays[i];
    });
  },
  async remove(id) {
    return locked(FILE, async () => {
      await writeAll((await readAll()).filter(p => p.id !== id));
    });
  },
  async share(id, token) {
    return locked(FILE, async () => {
      const plays = await readAll();
      const p = plays.find(x => x.id === id);
      if (p) { p.shareToken = token; await writeAll(plays); }
    });
  },
  async byShare(token) {
    const found = (await readAll()).find(x => x.shareToken === token);
    const p = found ? { ...found, ...upgrade(found) } : undefined;
    return p ? { ...p, shareToken: undefined } : null;
  },
  async setTags(id, tags) {
    return locked(FILE, async () => {
      const plays = await readAll();
      const p = plays.find(x => x.id === id);
      if (!p) return false;
      p.tags = tags;
      await writeAll(plays);
      return true;
    });
  },
};

/* One table; the play's pieces and steps live in a jsonb column. */
function neonStore(url: string): PlayStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS plays (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`ALTER TABLE plays ADD COLUMN IF NOT EXISTS share_token text`;
    await sql`ALTER TABLE plays ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`;
    await sql`ALTER TABLE plays ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS plays_share_token ON plays (share_token)`;
  })().catch(e => { ready = null; throw e; }));

  type Row = { id: string; name: string; data: PlayData; updated_at: string | Date; revision?: number | null; share_token?: string | null; tags?: string[] | null };
  const toPlay = (r: Row): Play => ({ ...upgrade(r.data), id: r.id, name: r.name, updatedAt: new Date(r.updated_at).toISOString(), revision: r.revision ?? 0, shareToken: r.share_token ?? null, tags: r.tags ?? [] });
  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  return {
    async list() {
      await init();
      const rows = (await sql`SELECT id, name, updated_at, tags FROM plays ORDER BY updated_at DESC`) as Omit<Row, "data">[];
      return rows.map(r => ({ id: r.id, name: r.name, updatedAt: new Date(r.updated_at).toISOString(), tags: r.tags ?? [] }));
    },
    async get(id) {
      if (!isUuid(id)) return null;
      await init();
      const rows = (await sql`SELECT * FROM plays WHERE id = ${id}`) as Row[];
      return rows[0] ? toPlay(rows[0]) : null;
    },
    async create(name, data) {
      await init();
      const rows = (await sql`
        INSERT INTO plays (id, name, data) VALUES (${crypto.randomUUID()}, ${name}, ${JSON.stringify(data)}::jsonb)
        RETURNING *`) as Row[];
      return toPlay(rows[0]);
    },
    async update(id, name, data, rev) {
      if (!isUuid(id)) return null;
      await init();
      // data || new: keys an older app version doesn't send are kept
      const r = rev ?? null;
      const rows = (await sql`
        UPDATE plays SET name = ${name}, data = data || ${JSON.stringify(data)}::jsonb, updated_at = now(), revision = revision + 1
        WHERE id = ${id} AND (${r}::int IS NULL OR revision = ${r}::int)
        RETURNING *`) as Row[];
      if (rows[0]) return toPlay(rows[0]);
      const exists = (await sql`SELECT 1 FROM plays WHERE id = ${id}`) as unknown[];
      return exists.length ? "conflict" : null;
    },
    async remove(id) {
      if (!isUuid(id)) return;
      await init();
      await sql`DELETE FROM plays WHERE id = ${id}`;
    },
    async share(id, token) {
      if (!isUuid(id)) return;
      await init();
      await sql`UPDATE plays SET share_token = ${token} WHERE id = ${id}`;
    },
    async byShare(token) {
      await init();
      const rows = (await sql`SELECT * FROM plays WHERE share_token = ${token}`) as Row[];
      return rows[0] ? { ...toPlay(rows[0]), shareToken: undefined } : null;
    },
    async setTags(id, tags) {
      if (!isUuid(id)) return false;
      await init();
      const rows = (await sql`UPDATE plays SET tags = ${tags}::text[] WHERE id = ${id} RETURNING id`) as { id: string }[];
      return rows.length > 0;
    },
  };
}

let chosen: PlayStore | null = null;
export function store(): PlayStore {
  if (!chosen) {
    const url = process.env.DATABASE_URL;
    if (url) chosen = neonStore(url);
    else if (process.env.VERCEL) throw new Error("DATABASE_URL is not set");
    else chosen = fileStore;
  }
  return chosen;
}
