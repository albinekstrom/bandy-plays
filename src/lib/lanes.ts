/* Open passing lanes: can a pass reach a teammate before any opponent can get
   his club to the ball? Ball and skaters at realistic speeds. */
import type { Pos, Pt } from "./types";

export const PASS_SPEED = 16;  // m/s, a firm pass on ice
export const OPP_SPEED = 7;    // m/s, a skater reacting from a glide
export const REACT = 0.35;     // s before an opponent reacts
export const CLUB = 1.3;       // m, how far a club reaches
export const RISKY = 0.35;     // s: closer than this to being cut off is risky

export type Lane = "open" | "risky" | "closed";

export function laneStatus(from: Pt, to: Pt, opps: Pos[]): { status: Lane; margin: number } {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  let margin = Infinity;
  for (let s = 1; s <= len - 0.5; s += 0.5) {
    const u = s / len;
    const p: Pt = [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u];
    const tBall = s / PASS_SPEED;
    for (const o of opps) {
      const tOpp = REACT + Math.max(0, Math.hypot(o.x - p[0], o.y - p[1]) - CLUB) / OPP_SPEED;
      margin = Math.min(margin, tOpp - tBall);
    }
  }
  return { status: margin <= 0 ? "closed" : margin < RISKY || len > 45 ? "risky" : "open", margin };
}
