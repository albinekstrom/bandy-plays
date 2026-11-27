/* Lines through a play: the main line, and variants that branch off it. */
import type { PlayData, Step, Variant } from "./types";

export type Line = string | null; // null = main line, else a variant id
export const MAIN_NAME = "Huvudspår";

const variantOf = (d: PlayData, line: Line): Variant | undefined =>
  line ? d.variants?.find(v => v.id === line) : undefined;

export function lineSteps(d: PlayData, line: Line): Step[] {
  const v = variantOf(d, line);
  return v ? [...d.steps.slice(0, v.from), ...v.steps] : d.steps;
}

/** Write a line's steps back: the shared part goes to the main line, the rest to the variant. */
export function writeLine(d: PlayData, line: Line, steps: Step[]): PlayData {
  const v = variantOf(d, line);
  if (!v) return { ...d, steps };
  const main = [...steps.slice(0, v.from), ...d.steps.slice(v.from)];
  return { ...d, steps: main, variants: d.variants!.map(x => (x.id === v.id ? { ...x, steps: steps.slice(v.from) } : x)) };
}

/** Apply to every step in every line (adding or removing a player). */
export function everyStep(d: PlayData, fn: (s: Step) => Step): PlayData {
  return { ...d, steps: d.steps.map(fn), variants: d.variants?.map(v => ({ ...v, steps: v.steps.map(fn) })) };
}

/** First step of a line that belongs only to it (0 for the main line). */
export function ownFrom(d: PlayData, line: Line) {
  return variantOf(d, line)?.from ?? 0;
}

export function lineName(d: PlayData, line: Line) {
  return variantOf(d, line)?.name ?? MAIN_NAME;
}

/** The lines you can continue on from step k of `line` (more than one = a choice). */
export function choicesAt(d: PlayData, line: Line, k: number): Line[] {
  const v = variantOf(d, line);
  if (v && k >= v.from) return [line]; // already on a variant past its branch
  const branching = (d.variants ?? []).filter(x => x.from === k).map(x => x.id);
  if (!branching.length) return [line];
  return [...(d.steps.length > k + 1 ? [null] : []), ...branching];
}

/** Who receives the pass at step k on this line, if there is one. */
export function receiverAt(d: PlayData, line: Line, k: number): string | null {
  const s = lineSteps(d, line);
  if (!s[k]?.arrows.some(a => a.kind === "pass")) return null;
  return s[k + 1]?.ball.holder ?? null;
}
