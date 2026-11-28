/* "Din uppgift": what a player does in a step, written by the coach or,
   when empty, read off the arrows. */
import type { Piece, Step } from "./types";
import { DEFAULT_SPORT, positionName, type Sport } from "./sports";
import { arrowKind } from "./play";

export function taskFor(id: string, step: Step, next: Step | undefined, pieces: Piece[], sport: Sport = DEFAULT_SPORT): { text: string; own: boolean } {
  const own = step.notes?.[id]?.trim();
  if (own) return { text: own, own: true };
  const name = (pid: string | null | undefined) => {
    const p = pieces.find(x => x.id === pid);
    return p ? (p.label ? positionName(sport, p.label) : "motståndaren") : "";
  };
  const parts: string[] = [];
  const pass = step.arrows.find(a => a.kind === "pass");
  const move = step.arrows.find(a => a.kind !== "pass" && a.piece === id);
  if (move && arrowKind(move, step) === "drib") parts.push("Driv bollen dit pilen visar");
  else if (move) parts.push("Åk dit pilen visar");
  if (pass && step.ball.holder === id && next?.ball.holder) parts.push(`passa till ${name(next.ball.holder).toLowerCase()}`);
  if (pass && next?.ball.holder === id && step.ball.holder !== id) parts.push("ta emot passningen");
  if (!pass && !move && step.ball.holder === id) parts.push("Håll i bollen");
  if (!parts.length) parts.push(next ? "Håll din position och läs spelet" : "Slutposition");
  const text = parts.join(", ");
  return { text: text[0].toUpperCase() + text.slice(1), own: false };
}
