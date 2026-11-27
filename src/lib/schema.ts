/* Versioned play format, read like a pydantic model: whatever version a play was saved
   in, it is upgraded step by step when read, and fields this version doesn't know are
   kept, so an older and a newer version of the app can share the same database.

   Rules for changing the format (see CLAUDE.md):
   - bump SCHEMA_VERSION and add one migration from the previous version; never edit or
     remove an old migration, so a play saved by any earlier version still upgrades;
   - migrations are pure and additive: add fields or fill defaults, never delete data;
   - data stored in the database is only rewritten when someone saves the play. */
import type { PlayData } from "./types";

export const SCHEMA_VERSION = 1;

type Data = PlayData & Record<string, unknown> & { v?: number };

const MIGRATIONS: Record<number, (d: Data) => Data> = {
  // 0 → 1: plays from before versions existed. The format is the same; only stamped.
  0: d => d,
};

/** The play's data in the current format. Plays from a newer version are left as they are. */
export function upgrade<T extends PlayData>(data: T): T & { v: number } {
  let d = { ...data } as Data;
  let v = typeof d.v === "number" && Number.isInteger(d.v) && d.v >= 0 ? d.v : 0;
  while (v < SCHEMA_VERSION) d = MIGRATIONS[v]({ ...d, v: ++v });
  return { ...d, v } as T & { v: number };
}

// fields of a stored play that are not part of its data
const META = new Set(["id", "name", "updatedAt", "shareToken", "tags", "base", "tab"]);

/** The data part of a play or a save request, unknown fields included. */
export function dataOf(o: Record<string, unknown>): PlayData & Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !META.has(k))) as PlayData & Record<string, unknown>;
}
