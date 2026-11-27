/* Remote control for presentation mode: the screen shows a 4-digit code, the
   coach's phone sends commands to it. A tiny shared record per session:
   the phone bumps `seq` with a command, the screen posts back its `state`.
   Neon when DATABASE_URL is set, otherwise memory (dev only). */
import "server-only";
import { neon } from "@neondatabase/serverless";

export interface Remote { code: string; playId: string; seq: number; cmd: string | null; state: unknown }

interface RemoteStore {
  create(playId: string): Promise<string>;
  get(code: string): Promise<Remote | null>;
  command(code: string, cmd: string): Promise<number | null>;
  setState(code: string, state: unknown): Promise<boolean>;
}

const newCode = () => String(Math.floor(1000 + Math.random() * 9000));
const TTL_MS = 12 * 60 * 60 * 1000;

function memoryStore(): RemoteStore {
  const g = globalThis as unknown as { __remotes?: Map<string, Remote & { at: number }> };
  const m = (g.__remotes ??= new Map());
  const live = (code: string) => { const r = m.get(code); return r && Date.now() - r.at < TTL_MS ? r : null; };
  return {
    async create(playId) {
      let code = newCode();
      while (live(code)) code = newCode();
      m.set(code, { code, playId, seq: 0, cmd: null, state: null, at: Date.now() });
      return code;
    },
    async get(code) { const r = live(code); return r ? { code, playId: r.playId, seq: r.seq, cmd: r.cmd, state: r.state } : null; },
    async command(code, cmd) { const r = live(code); if (!r) return null; r.seq++; r.cmd = cmd; r.at = Date.now(); return r.seq; },
    async setState(code, state) { const r = live(code); if (!r) return false; r.state = state; r.at = Date.now(); return true; },
  };
}

function neonStore(url: string): RemoteStore {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= sql`
    CREATE TABLE IF NOT EXISTS remotes (
      code text PRIMARY KEY,
      play_id text NOT NULL,
      seq int NOT NULL DEFAULT 0,
      cmd text,
      state jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.catch(e => { ready = null; throw e; }));
  type Row = { code: string; play_id: string; seq: number; cmd: string | null; state: unknown };
  return {
    async create(playId) {
      await init();
      await sql`DELETE FROM remotes WHERE updated_at < now() - interval '12 hours'`;
      for (let i = 0; i < 20; i++) {
        const code = newCode();
        const rows = (await sql`INSERT INTO remotes (code, play_id) VALUES (${code}, ${playId}) ON CONFLICT DO NOTHING RETURNING code`) as Row[];
        if (rows.length) return code;
      }
      throw new Error("no free remote code");
    },
    async get(code) {
      await init();
      const rows = (await sql`SELECT * FROM remotes WHERE code = ${code} AND updated_at > now() - interval '12 hours'`) as Row[];
      const r = rows[0];
      return r ? { code: r.code, playId: r.play_id, seq: r.seq, cmd: r.cmd, state: r.state } : null;
    },
    async command(code, cmd) {
      await init();
      const rows = (await sql`UPDATE remotes SET seq = seq + 1, cmd = ${cmd}, updated_at = now() WHERE code = ${code} RETURNING seq`) as Row[];
      return rows[0]?.seq ?? null;
    },
    async setState(code, state) {
      await init();
      const rows = (await sql`UPDATE remotes SET state = ${JSON.stringify(state)}::jsonb, updated_at = now() WHERE code = ${code} RETURNING code`) as Row[];
      return rows.length > 0;
    },
  };
}

let chosen: RemoteStore | null = null;
export function remotes(): RemoteStore {
  return (chosen ??= process.env.DATABASE_URL ? neonStore(process.env.DATABASE_URL) : memoryStore());
}

export const CMDS = /^(next|prev|first|all|stop|pick:[A-Za-z0-9-]{1,64})$/;
