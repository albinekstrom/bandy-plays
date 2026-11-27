/* Where plays are kept. Phase 1: a local JSON file (dev only).
   Phase 2 adds Neon Postgres, picked when DATABASE_URL is set. */
import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Play, PlayData, PlaySummary } from "./types";

export interface PlayStore {
  list(): Promise<PlaySummary[]>;
  get(id: string): Promise<Play | null>;
  create(name: string, data: PlayData): Promise<Play>;
  update(id: string, name: string, data: PlayData): Promise<Play | null>;
  remove(id: string): Promise<void>;
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
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
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
    plays[i] = { id, name, updatedAt: new Date().toISOString(), ...data };
    await writeAll(plays);
    return plays[i];
  },
  async remove(id) {
    await writeAll((await readAll()).filter(p => p.id !== id));
  },
};

export function store(): PlayStore {
  return fileStore;
}
