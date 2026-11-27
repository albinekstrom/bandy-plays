/* Pure play logic: creating plays, resolving positions, animating between steps.
   Shared by the editor (client) and the server. */
import type { Arrow, ArrowKind, Ball, Piece, PlayData, Pos, Pt, Step } from "./types";
import { US_START, THEM_START } from "./rink";
import { along, clamp, curvePts, spline, dist, ease, heading, lerp, lerpAngle, polyLength } from "./geom";

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

/* ---------- motion between two steps ----------
   Everyone skates at the same speed, so short runs finish early.
   Players face the way they skate, then turn to the direction set
   for the next step. A pass leaves when the passer's run ends and,
   if needed, waits so the ball meets the receiver on arrival. */

export const SKATE = 6;   // m per second on screen
export const BALL_SPEED = 20;
export const TURN = 0.35; // seconds to turn on the spot

/** How an arrow reads: only the ball holder can dribble, so his run is a dribble and anyone else's is a run. */
export function arrowKind(a: Arrow, step: Step): ArrowKind {
  if (a.kind === "pass") return "pass";
  return a.piece && a.piece === step.ball.holder ? "drib" : "run";
}

const moveArrow = (s: Step, id: string) => s.arrows.find(r => r.kind !== "pass" && r.piece === id);

/** Sampled path of an arrow, with ends pinned to where things are in step k and k+1. */
export function arrowCurve(a: Arrow, step: Step, next: Step | undefined): Pt[] {
  if (a.kind === "pass") {
    const to = next ? ballPoint(next.ball, next.pos) : a.pts[a.pts.length - 1];
    return curvePts(passOrigin(step, next), to, null);
  }
  const p = a.piece ? step.pos[a.piece] : undefined;
  const q = a.piece ? next?.pos[a.piece] : undefined;
  const from: Pt = p ? [p.x, p.y] : a.pts[0];
  const to: Pt = q ? [q.x, q.y] : a.pts[a.pts.length - 1];
  if (a.ctrl) return curvePts(from, to, a.ctrl);
  return spline([from, ...a.pts.slice(1, -1), to]);
}

/** Where the ball leaves from: the passer's spot `passAt` of the way through his own run. */
export function passOrigin(step: Step, next: Step | undefined): Pt {
  const passer = step.ball.holder;
  const run = passer && next?.pos[passer] ? moveArrow(step, passer) : undefined;
  if (!passer || !run) return ballPoint(step.ball, step.pos);
  const path = arrowCurve(run, step, next);
  const u = ease(clamp(step.passAt ?? 1, 0, 1));
  const p = along(path, u), q = along(path, Math.min(1, u + 0.02)), o = along(path, Math.max(0, u - 0.02));
  return carried({ x: p[0], y: p[1], dir: heading(o, q) });
}

/** The ball holder's run in a step, if he skates (dribbles). */
export const holderRun = (step: Step) => (step.ball.holder ? moveArrow(step, step.ball.holder) : undefined);

interface Mover { path: Pt[]; len: number; dur: number; startDir: number; endDir: number }
export interface Plan {
  a: Step;
  b: Step;
  T: number;
  movers: Record<string, Mover>;
  pass: { path: Pt[]; start: number; flight: number } | null;
}

export function plan(a: Step, b: Step): Plan {
  const movers: Record<string, Mover> = {};
  let T = 0.8;
  for (const id of Object.keys(a.pos)) {
    const p = a.pos[id], q = b.pos[id] ?? p;
    const arrow = moveArrow(a, id);
    const moved = dist([p.x, p.y], [q.x, q.y]) > 0.05;
    const path = arrow ? arrowCurve(arrow, a, b) : moved ? curvePts([p.x, p.y], [q.x, q.y], null) : [[p.x, p.y] as Pt];
    const len = polyLength(path);
    const dur = len / SKATE;
    movers[id] = { path, len, dur, startDir: p.dir, endDir: q.dir };
    T = Math.max(T, dur + TURN);
  }
  let pass: Plan["pass"] = null;
  const arrow = a.arrows.find(r => r.kind === "pass");
  if (arrow) {
    const path = arrowCurve(arrow, a, b);
    const flight = Math.max(0.25, polyLength(path) / BALL_SPEED);
    const passer = a.ball.holder, rec = b.ball.holder;
    let start = passer && moveArrow(a, passer) ? movers[passer].dur * clamp(a.passAt ?? 1, 0, 1) : 0;
    // with no timing set, wait so the ball meets the receiver; a set timing is kept as drawn
    if (rec && movers[rec] && (a.passAt === undefined || !passer || !moveArrow(a, passer))) start = Math.max(start, movers[rec].dur - flight);
    pass = { path, start, flight };
    T = Math.max(T, start + flight + 0.2);
  }
  return { a, b, T, movers, pass };
}

function moverAt(m: Mover, t: number): Pos {
  if (m.len < 0.05) {
    const [x, y] = m.path[0];
    return { x, y, dir: lerpAngle(m.startDir, m.endDir, clamp(t / TURN, 0, 1)) };
  }
  const u = ease(clamp(t / m.dur, 0, 1));
  const [x, y] = along(m.path, u);
  const n = m.path.length;
  if (t < m.dur) {
    const tan = heading(along(m.path, Math.max(0, u - 0.02)), along(m.path, Math.min(1, u + 0.02)));
    return { x, y, dir: lerpAngle(m.startDir, tan, clamp(t / TURN, 0, 1)) };
  }
  const endTan = heading(m.path[n - 2], m.path[n - 1]);
  return { x, y, dir: lerpAngle(endTan, m.endDir, clamp((t - m.dur) / TURN, 0, 1)) };
}

/** Where everything is t seconds into the move from step a to step b. */
export function frameAt(pl: Plan, t: number): Frame {
  const pos: Record<string, Pos> = {};
  for (const id of Object.keys(pl.movers)) pos[id] = moverAt(pl.movers[id], t);
  const { a, b, pass } = pl;
  let ball: Pt;
  if (pass) {
    const passer = a.ball.holder, rec = b.ball.holder;
    if (t < pass.start) ball = passer && pos[passer] ? carried(pos[passer]) : ballPoint(a.ball, a.pos);
    else if (t < pass.start + pass.flight) ball = along(pass.path, (t - pass.start) / pass.flight);
    else ball = rec && pos[rec] ? carried(pos[rec]) : pass.path[pass.path.length - 1];
  } else if (a.ball.holder && a.ball.holder === b.ball.holder && pos[a.ball.holder]) {
    ball = carried(pos[a.ball.holder]);
  } else {
    const s = ballPoint(a.ball, a.pos), e = ballPoint(b.ball, b.pos), u = ease(clamp(t / pl.T, 0, 1));
    ball = [lerp(s[0], e[0], u), lerp(s[1], e[1], u)];
  }
  return { pos, ball };
}

export interface Frame {
  pos: Record<string, Pos>;
  ball: Pt;
}

export function stillFrame(step: Step): Frame {
  return { pos: step.pos, ball: ballPoint(step.ball, step.pos) };
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

/** A new step to follow step k: everyone starts where step k's moves end. */
export function stepAfter(steps: Step[], k: number, pieces: Piece[]): Step {
  const cur = steps[k];
  if (cur.arrows.length && steps[k + 1]) return copyStep(steps[k + 1]);
  if (!cur.arrows.length) return copyStep(cur);
  const end = endState(cur, pieces);
  return { id: uid(), text: "", pos: end.pos, ball: end.ball, arrows: [] };
}

/** Where everything is once a step's arrows are done: runs at their ends, facing the way
    they end; a passed ball with the player nearest where the pass ends. */
export function endState(step: Step, pieces: Piece[]): { pos: Record<string, Pos>; ball: Ball } {
  const pos = Object.fromEntries(Object.entries(step.pos).map(([k, v]) => [k, { ...v }]));
  for (const a of step.arrows) {
    if (a.kind === "pass" || !a.piece || !pos[a.piece]) continue;
    const path = arrowCurve(a, step, undefined);
    const e = path[path.length - 1];
    const dir = path.length > 1 ? Math.round(heading(path[Math.max(0, path.length - 3)], e)) : pos[a.piece].dir;
    pos[a.piece] = { x: e[0], y: e[1], dir };
  }
  let ball: Ball = { ...step.ball };
  const pass = step.arrows.find(a => a.kind === "pass");
  if (pass) {
    const e = pass.pts[pass.pts.length - 1];
    const rec = nearestPiece(pieces, pos, e, 3.2);
    ball = { holder: rec, x: e[0], y: e[1] };
  }
  return { pos, ball };
}

/** The way a piece faces at the end of its run from step k-1, or null if it didn't skate. */
export function runEndDir(steps: Step[], k: number, id: string): number | null {
  const prev = steps[k - 1];
  const run = prev && moveArrow(prev, id);
  if (!run) return null;
  const path = arrowCurve(run, prev, steps[k]);
  if (path.length < 2 || polyLength(path) < 0.5) return null;
  return Math.round(heading(path[Math.max(0, path.length - 3)], path[path.length - 1]));
}

/** Move a piece in step k. With follow, later steps where it stood still follow along
    (used when a new run sets where he ends up); without it only step k changes, so editing
    an early step never rearranges the steps already planned after it. */
export function movePiece(steps: Step[], k: number, id: string, to: Partial<Pos>, follow = false): Step[] {
  const out = steps.slice();
  const old = out[k].pos[id];
  out[k] = { ...out[k], pos: { ...out[k].pos, [id]: { ...old, ...to } } };
  if (!follow) return out;
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
  const variantsOk = o.variants === undefined || (Array.isArray(o.variants) && o.variants.length <= 20 &&
    o.variants.every(v => v && typeof v.id === "string" && typeof v.name === "string" && Number.isInteger(v.from) &&
      v.from >= 0 && v.from < o.steps.length && Array.isArray(v.steps) && v.steps.length > 0 && v.steps.length <= 200));
  return Array.isArray(o.pieces) && Array.isArray(o.steps) && o.steps.length > 0 && o.steps.length <= 200 && o.pieces.length <= 60 && variantsOk;
}
