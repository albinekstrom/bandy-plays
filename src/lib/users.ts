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

export const SEED_NAME = "daniel";
/** admin: edits plays and accounts. player: watches, quizzes, changes his own password. */
export type Role = "admin" | "player";
export const ROLE_NAMES: Record<Role, string> = { admin: "Admin", player: "Spelare" };
export const MIN_TEAM_CODE = 4;

interface UserStore {
  count(): Promise<number>;
  list(): Promise<{ name: string; role: Role }[]>;
  hash(name: string): Promise<string | null>;
  role(name: string): Promise<Role | null>;
  setRole(name: string, role: Role): Promise<void>;
  /** false if the name is taken */
  add(name: string, hash: string, role: Role): Promise<boolean>;
  setHash(name: string, hash: string): Promise<void>;
  /** The team code people need to create their own account (hashed). */
  teamCode(): Promise<string | null>;
  setTeamCode(hash: string): Promise<void>;
}

const FILE = join(process.cwd(), ".data", "users.json");
const SETTINGS = join(process.cwd(), ".data", "settings.json");
type Rec = { name: string; hash: string; role?: Role };
async function readAll(): Promise<Rec[]> { try { return JSON.parse(await readFile(FILE, "utf8")); } catch { return []; } }
async function writeAll(u: Rec[]) { await mkdir(join(process.cwd(), ".data"), { recursive: true }); await writeFile(FILE, JSON.stringify(u, null, 1)); }
async function readSettings(): Promise<Record<string, string>> { try { return JSON.parse(await readFile(SETTINGS, "utf8")); } catch { return {}; } }

const fileStore: UserStore = {
  async count() { return (await readAll()).length; },
  async list() { return (await readAll()).map(u => ({ name: u.name, role: u.role ?? "player" as Role })).sort((a, b) => a.name.localeCompare(b.name)); },
  async hash(name) { return (await readAll()).find(u => u.name === name)?.hash ?? null; },
  async role(name) { const u = (await readAll()).find(x => x.name === name); return u ? u.role ?? "player" : null; },
  async setRole(name, role) {
    const all = await readAll();
    const u = all.find(x => x.name === name);
    if (u) { u.role = role; await writeAll(all); }
  },
  async add(name, hash, role) {
    const all = await readAll();
    if (all.some(u => u.name === name)) return false;
    all.push({ name, hash, role });
    await writeAll(all);
    return true;
  },
  async setHash(name, hash) {
    const all = await readAll();
    const u = all.find(x => x.name === name);
    if (u) { u.hash = hash; await writeAll(all); }
  },
  async teamCode() { return (await readSettings()).teamCode ?? null; },
  async setTeamCode(hash) {
    const s = await readSettings();
    s.teamCode = hash;
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    await writeFile(SETTINGS, JSON.stringify(s, null, 1));
  },
};

function neonStore(url: string): UserStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        name text PRIMARY KEY,
        hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player'`;
    await sql`CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text NOT NULL)`;
  })().catch(e => { ready = null; throw e; }));
  return {
    async count() { await init(); return Number(((await sql`SELECT count(*)::int AS n FROM users`) as { n: number }[])[0].n); },
    async list() { await init(); return (await sql`SELECT name, role FROM users ORDER BY name`) as { name: string; role: Role }[]; },
    async hash(name) { await init(); return ((await sql`SELECT hash FROM users WHERE name = ${name}`) as { hash: string }[])[0]?.hash ?? null; },
    async role(name) { await init(); return ((await sql`SELECT role FROM users WHERE name = ${name}`) as { role: Role }[])[0]?.role ?? null; },
    async setRole(name, role) { await init(); await sql`UPDATE users SET role = ${role} WHERE name = ${name}`; },
    async add(name, hash, role) {
      await init();
      return ((await sql`INSERT INTO users (name, hash, role) VALUES (${name}, ${hash}, ${role}) ON CONFLICT DO NOTHING RETURNING name`) as unknown[]).length > 0;
    },
    async setHash(name, hash) { await init(); await sql`UPDATE users SET hash = ${hash} WHERE name = ${name}`; },
    async teamCode() { await init(); return ((await sql`SELECT value FROM settings WHERE key = 'team_code'`) as { value: string }[])[0]?.value ?? null; },
    async setTeamCode(hash) {
      await init();
      await sql`INSERT INTO settings (key, value) VALUES ('team_code', ${hash}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    },
  };
}

let chosen: UserStore | null = null;
let seeded: Promise<void> | null = null;

/* The first time, the old shared password becomes daniel's password and the
   team code, so nobody has to type a password anywhere new. */
async function seed(s: UserStore) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) {
    const all = await s.list();
    if (!all.some(u => u.role === "admin") && all.some(u => u.name === SEED_NAME)) await s.setRole(SEED_NAME, "admin");
    return;
  }
  if ((await s.count()) === 0) await s.add(SEED_NAME, await hashPassword(pw), "admin");
  // there is always an admin: daniel, if nobody else is
  const all = await s.list();
  if (!all.some(u => u.role === "admin") && all.some(u => u.name === SEED_NAME)) await s.setRole(SEED_NAME, "admin");
  if (!(await s.teamCode())) await s.setTeamCode(await hashPassword(pw));
}

export async function usersReady(): Promise<UserStore> {
  const s = (chosen ??= process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : fileStore);
  await (seeded ??= seed(s).catch(e => { seeded = null; throw e; }));
  return s;
}
