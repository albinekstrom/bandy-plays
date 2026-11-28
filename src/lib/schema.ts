/* Versioned play format, read like a pydantic model: whatever version a play was saved
   in, it is upgraded step by step when read, and fields this version doesn't know are
   kept, so an older and a newer version of the app can share the same database.

   Rules for changing the format (see CLAUDE.md):
   - bump SCHEMA_VERSION and add one migration from the previous version; never edit or
     remove an old migration, so a play saved by any earlier version still upgrades;
   - migrations are pure and additive: add fields or fill defaults, never delete data;
   - data stored in the database is only rewritten when someone saves the play. */
import type { PlayData } from "./types";
import { ZONE_MIN, ZONE_MAX } from "./rink";

export const SCHEMA_VERSION = 2;

type Data = PlayData & Record<string, unknown> & { v?: number };

const MIGRATIONS: Record<number, (d: Data) => Data> = {
  // 0 → 1: plays from before versions existed. The format is the same; only stamped.
  0: d => d,
  // 1 → 2: optional `zone` (half width of the växlingszon). Plays without it use the
  // default (rink.ts), so nothing is filled in here.
  1: d => d,
};

/** The play's data in the current format. Plays from a newer version are left as they are. */
export function upgrade<T extends PlayData>(data: T): T & { v: number } {
  let d = { ...data } as Data;
  let v = typeof d.v === "number" && Number.isInteger(d.v) && d.v >= 0 ? d.v : 0;
  while (v < SCHEMA_VERSION) d = MIGRATIONS[v]({ ...d, v: ++v });
  return withDefaults({ ...d, v }) as T & { v: number };
}

/* Defaults for optional fields older versions may have left out, so callers can rely on
   them (like pydantic defaults). Unknown fields are kept; nothing is removed. */
const stepDefaults = (s: Record<string, unknown>) => (typeof s.text === "string" ? s : { ...s, text: "" });
function withDefaults<T extends Record<string, unknown>>(d: T): T {
  const steps = Array.isArray(d.steps) ? d.steps.map(s => stepDefaults(s as Record<string, unknown>)) : d.steps;
  const variants = Array.isArray(d.variants)
    ? d.variants.map(v => (Array.isArray((v as { steps?: unknown }).steps)
      ? { ...(v as object), steps: (v as { steps: Record<string, unknown>[] }).steps.map(stepDefaults) } : v))
    : d.variants;
  return { ...d, steps, ...(variants !== undefined ? { variants } : {}) };
}

// fields of a stored play that are not part of its data
const META = new Set(["id", "name", "updatedAt", "revision", "shareToken", "tags", "rev", "base", "tab"]);

/** The data part of a play or a save request, unknown fields included. */
export function dataOf(o: Record<string, unknown>): PlayData & Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !META.has(k))) as PlayData & Record<string, unknown>;
}

/* ---------- validation at the write boundary ----------
   Checks every field this version knows, at every level, and accepts what older versions
   wrote (optional text, notes, passAt, the old `ctrl` curve). Fields it doesn't know are
   allowed and kept: a valid play is returned unchanged. */
type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const isId = (v: unknown) => isStr(v, 64) && (v as string).length > 0;
const opt = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v);
const list = (v: unknown, max: number, ok: (v: unknown) => boolean, min = 0) =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every(ok);
const isPt = (v: unknown) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

const isPiece = (v: unknown) => isObj(v) && isId(v.id) && (v.side === "us" || v.side === "them") && isStr(v.label, 20);
const isPos = (v: unknown) => isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.dir);
const isArrow = (v: unknown) => isObj(v) && isId(v.id) && (v.kind === "run" || v.kind === "drib" || v.kind === "pass") &&
  (v.piece === null || isId(v.piece)) && list(v.pts, 400, isPt, 1) && opt(v.ctrl, c => c === null || isPt(c)) &&
  opt(v.lob, l => typeof l === "boolean");
const isStep = (v: unknown) => isObj(v) && isId(v.id) && opt(v.text, t => isStr(t, 500)) &&
  isObj(v.pos) && Object.keys(v.pos).length <= 60 && Object.values(v.pos).every(isPos) &&
  isObj(v.ball) && (v.ball.holder === null || isId(v.ball.holder)) && isNum(v.ball.x) && isNum(v.ball.y) &&
  list(v.arrows, 100, isArrow) && opt(v.passAt, isNum) &&
  opt(v.notes, n => isObj(n) && Object.keys(n).length <= 60 && Object.values(n).every(t => isStr(t, 500)));

/** The play data if every known field is valid, else null. Unknown fields are kept and
    missing optional fields get their defaults (a step's text is always a string). */
export function parsePlayData(v: unknown): (PlayData & O) | null {
  if (!isObj(v) || !list(v.pieces, 60, isPiece) || !list(v.steps, 200, isStep, 1)) return null;
  const n = (v.steps as unknown[]).length;
  const variantOk = (x: unknown) => isObj(x) && isId(x.id) && isStr(x.name, 100) &&
    Number.isInteger(x.from) && (x.from as number) >= 0 && (x.from as number) < n && list(x.steps, 200, isStep, 1);
  if (!opt(v.variants, x => list(x, 20, variantOk))) return null;
  if (!opt(v.zone, z => isNum(z) && (z as number) >= ZONE_MIN && (z as number) <= ZONE_MAX)) return null;
  return withDefaults(v) as PlayData & O;
}
