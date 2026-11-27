/* Pure play logic: creating plays, resolving positions, animating between steps.
   Shared by the editor (client) and the server. */
import type { Arrow, Ball, Piece, PlayData, Pos, Pt, Step } from "./types";
import { US_START, THEM_START } from "./rink";
import { along, dist, ease, lerp, lerpAngle, smooth } from "./geom";

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

export function newPlayData(): PlayData {
  const pieces: Piece[] = [];
  const pos: Record<string, Pos> = {};
  for (const [label, x, y] of US_START) {
    const id = uid();
    pieces.push({ id, side: "us", label });
    pos[id] = { x, y, dir: 0 };
  }
  THEM_START.forEach(([x, y]) => {
    const id = uid();
    pieces.push({ id, side: "them", label: "" });
    pos[id] = { x, y, dir: 180 };
  });
  const mv = pieces[0].id;
  return { pieces, steps: [{ id: uid(), text: "", pos, ball: { holder: mv, x: pos[mv].x, y: pos[mv].y }, arrows: [] }] };
}

export const CARRY = 1.2; // ball sits this far in front of its holder

export function carried(p: Pos): Pt {
  const a = (p.dir * Math.PI) / 180;
  return [p.x + Math.cos(a) * CARRY, p.y + Math.sin(a) * CARRY];
}

export function ballPoint(ball: Ball, pos: Record<string, Pos>): Pt {
  const h = ball.holder && pos[ball.holder];
  return h ? carried(h) : [ball.x, ball.y];
}

/** Arrow points with the ends pinned to where things actually are in step k and k+1. */
export function arrowPts(a: Arrow, step: Step, next: Step | undefined): Pt[] {
  const pts = a.pts.slice();
  if (a.kind === "pass") {
    pts[0] = ballPoint(step.ball, step.pos);
    if (next) pts[pts.length - 1] = ballPoint(next.ball, next.pos);
  } else if (a.piece && step.pos[a.piece]) {
    const p = step.pos[a.piece];
    pts[0] = [p.x, p.y];
    const q = next?.pos[a.piece];
    if (q) pts[pts.length - 1] = [q.x, q.y];
  }
  return pts;
}

export interface Frame {
  pos: Record<string, Pos>;
  ball: Pt;
}

export function stillFrame(step: Step): Frame {
  return { pos: step.pos, ball: ballPoint(step.ball, step.pos) };
}

/** Where everything is at fraction u of the way from step k to step k+1. */
export function frameBetween(a: Step, b: Step, u: number): Frame {
  const e = ease(u);
  const pos: Record<string, Pos> = {};
  for (const id of Object.keys(a.pos)) {
    const p = a.pos[id], q = b.pos[id] ?? p;
    const arrow = a.arrows.find(r => r.kind !== "pass" && r.piece === id);
    const [x, y] = arrow ? along(smooth(arrowPts(arrow, a, b)), e) : [lerp(p.x, q.x, e), lerp(p.y, q.y, e)];
    pos[id] = { x, y, dir: lerpAngle(p.dir, q.dir, e) };
  }
  let ball: Pt;
  const pass = a.arrows.find(r => r.kind === "pass");
  if (pass) {
    ball = along(smooth(arrowPts(pass, a, b)), e);
  } else if (a.ball.holder && a.ball.holder === b.ball.holder && pos[a.ball.holder]) {
    ball = carried(pos[a.ball.holder]);
  } else {
    const s = ballPoint(a.ball, a.pos), t = ballPoint(b.ball, b.pos);
    ball = [lerp(s[0], t[0], e), lerp(s[1], t[1], e)];
  }
  return { pos, ball };
}

/** The nearest piece within reach of a point, optionally limited to one side. */
export function nearestPiece(pieces: Piece[], pos: Record<string, Pos>, p: Pt, reach: number, side?: "us" | "them") {
  let best: string | null = null, bd = reach;
  for (const pc of pieces) {
    if (side && pc.side !== side) continue;
    const q = pos[pc.id];
    if (!q) continue;
    const d = dist(p, [q.x, q.y]);
    if (d < bd) { bd = d; best = pc.id; }
  }
  return best;
}

export function copyStep(s: Step): Step {
  return {
    id: uid(),
    text: "",
    pos: Object.fromEntries(Object.entries(s.pos).map(([k, v]) => [k, { ...v }])),
    ball: { ...s.ball },
    arrows: [],
  };
}

/** Move a piece in step k; later steps where it stood still follow along. */
export function movePiece(steps: Step[], k: number, id: string, to: Partial<Pos>): Step[] {
  const out = steps.slice();
  const old = out[k].pos[id];
  out[k] = { ...out[k], pos: { ...out[k].pos, [id]: { ...old, ...to } } };
  for (let j = k + 1; j < out.length; j++) {
    const prevArrow = out[j - 1].arrows.some(a => a.piece === id);
    const cur = out[j].pos[id];
    if (prevArrow || !cur || cur.x !== old.x || cur.y !== old.y || cur.dir !== old.dir) break;
    out[j] = { ...out[j], pos: { ...out[j].pos, [id]: { ...cur, ...to } } };
  }
  return out;
}

export function isPlayData(d: unknown): d is PlayData {
  if (!d || typeof d !== "object") return false;
  const o = d as PlayData;
  return Array.isArray(o.pieces) && Array.isArray(o.steps) && o.steps.length > 0 && o.steps.length <= 200 && o.pieces.length <= 60;
}
