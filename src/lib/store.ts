/* Where plays are kept: Neon Postgres when DATABASE_URL is set,
   otherwise a local JSON file (dev only; Vercel's disk is read-only). */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Play, PlayData, PlaySummary } from "./types";

export interface PlayStore {
  list(): Promise<PlaySummary[]>;
  get(id: string): Promise<Play | null>;
  create(name: string, data: PlayData): Promise<Play>;
  update(id: string, name: string, data: PlayData): Promise<Play | null>;
  remove(id: string): Promise<void>;
  /** Set (token) or revoke (null) the read-only share link. */
  share(id: string, token: string | null): Promise<void>;
  byShare(token: string): Promise<Play | null>;
  /** Returns false when the play does not exist. */
  setTags(id: string, tags: string[]): Promise<boolean>;
}

const FILE = join(process.cwd(), ".data", "plays.json");

async function readAll(): Promise<Play[]> {
  try { return JSON.parse(await readFile(FILE, "utf8")); } catch { return []; }
}
async function writeAll(plays: Play[]) {
  await mkdir(join(process.cwd(), ".data"), { recursive: true });
  await writeFile(FILE, JSON.stringify(plays, null, 1));
}

const fileStore: PlayStore = {
  async list() {
    return (await readAll())
      .map(({ id, name, updatedAt, tags }) => ({ id, name, updatedAt, tags: tags ?? [] }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    return (await readAll()).find(p => p.id === id) ?? null;
  },
  async create(name, data) {
    const plays = await readAll();
    const play: Play = { id: crypto.randomUUID(), name, updatedAt: new Date().toISOString(), ...data };
    plays.push(play);
    await writeAll(plays);
    return play;
  },
  async update(id, name, data) {
    const plays = await readAll();
    const i = plays.findIndex(p => p.id === id);
    if (i < 0) return null;
    plays[i] = { ...plays[i], id, name, updatedAt: new Date().toISOString(), ...data };
    await writeAll(plays);
    return plays[i];
  },
  async remove(id) {
    await writeAll((await readAll()).filter(p => p.id !== id));
  },
  async share(id, token) {
    const plays = await readAll();
    const p = plays.find(x => x.id === id);
    if (p) { p.shareToken = token; await writeAll(plays); }
  },
  async byShare(token) {
    const p = (await readAll()).find(x => x.shareToken === token);
    return p ? { ...p, shareToken: undefined } : null;
  },
  async setTags(id, tags) {
    const plays = await readAll();
    const p = plays.find(x => x.id === id);
    if (!p) return false;
    p.tags = tags;
    await writeAll(plays);
    return true;
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
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS plays_share_token ON plays (share_token)`;
  })().catch(e => { ready = null; throw e; }));

  type Row = { id: string; name: string; data: PlayData; updated_at: string | Date; share_token?: string | null; tags?: string[] | null };
  const toPlay = (r: Row): Play => ({ id: r.id, name: r.name, updatedAt: new Date(r.updated_at).toISOString(), shareToken: r.share_token ?? null, tags: r.tags ?? [], ...r.data });
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
    async update(id, name, data) {
      if (!isUuid(id)) return null;
      await init();
      const rows = (await sql`
        UPDATE plays SET name = ${name}, data = ${JSON.stringify(data)}::jsonb, updated_at = now()
        WHERE id = ${id} RETURNING *`) as Row[];
      return rows[0] ? toPlay(rows[0]) : null;
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
