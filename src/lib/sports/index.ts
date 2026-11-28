/* The sports a play can be drawn for. A play names its sport by id (PlayData.sport);
   plays without one, or with an id this version doesn't know, are bandy. */
import type { PlayData, Pt } from "../types";
import type { Marking, Sport } from "./types";
import { bandy } from "./bandy";

export type { Marking, Position, Sport, SubZone } from "./types";
export { bandy };

export const DEFAULT_SPORT = bandy;

export const SPORTS: Record<string, Sport> = { bandy };

export const sportById = (id: unknown): Sport =>
  (typeof id === "string" && Object.hasOwn(SPORTS, id) ? SPORTS[id] : DEFAULT_SPORT);

export const sportOf = (d: Pick<PlayData, "sport">): Sport => sportById(d.sport);

/** Swedish name for a piece's label (position code), else the label itself. */
export const positionName = (sport: Sport, label: string) => sport.names[label] ?? label;

/** The half width of the play's substitution zone, or null when the sport has none. */
export function zoneOf(d: { zone?: number }, sport: Sport): number | null {
  const z = sport.zone;
  if (!z) return null;
  return typeof d.zone === "number" && d.zone >= z.min && d.zone <= z.max ? d.zone : z.default;
}

/* ---------- markings as SVG / canvas paths ---------- */
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
const pt = (at: Pt, r: number, a: number) => `${r6(at[0] + r * Math.cos(a))} ${r6(at[1] + r * Math.sin(a))}`;

/** SVG path data for an arc marking (circles are drawn as <circle>). */
export function arcPath(m: Extract<Marking, { kind: "arc" }>): string {
  const a = m.from ?? 0, b = m.to ?? 2 * Math.PI;
  return `M${pt(m.at, m.r, a)} A${m.r} ${m.r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${pt(m.at, m.r, b)}`;
}

export const isCircle = (m: Extract<Marking, { kind: "arc" }>) => m.from === undefined && m.to === undefined;
