/* "Placera övriga automatiskt": players without their own arrows follow the
   ball by simple rules (the same idea as the Uppspel page). Ours shift with
   the ball; theirs close in on it, the nearest one presses, the keepers stay. */
import type { Piece, Pos, Step } from "./types";
import { DEFAULT_SPORT, type Sport } from "./sports";
import { ballPoint } from "./play";
import { clamp } from "./geom";

const facing = (p: { x: number; y: number }, b: [number, number]) => Math.round((Math.atan2(b[1] - p.y, b[0] - p.x) * 180) / Math.PI);

export function autoPlace(steps: Step[], pieces: Piece[], opts: { us: boolean; them: boolean }, sport: Sport = DEFAULT_SPORT): Step[] {
  const L = sport.length, W = sport.width, MIDY = W / 2;
  const out = steps.map(s => ({ ...s, pos: { ...s.pos } }));
  // keepers: the player of each side closest to his own goal at the start
  const keeper = (side: "us" | "them") => {
    const gx = side === "us" ? 0 : L;
    let best: string | null = null, bd = 6;
    for (const p of pieces) {
      const q = steps[0].pos[p.id];
      if (p.side !== side || !q) continue;
      const d = Math.hypot(q.x - gx, q.y - MIDY);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  };
  const keepers = new Set([keeper("us"), keeper("them")].filter(Boolean));

  // Players who never get an arrow keep their place in the shape relative to the ball,
  // from a home spot: ours from the standard formation (or worked back from step 1),
  // theirs worked back from where they stand in step 1.
  const b0 = ballPoint(steps[0].ball, steps[0].pos);
  const scriptedEver = new Set(steps.flatMap(s => s.arrows.map(a => a.piece)).filter(Boolean));
  const home: Record<string, { x: number; y: number }> = {};
  for (const p of pieces) {
    const q = steps[0].pos[p.id];
    if (!q) continue;
    if (p.side === "us") {
      const f = sport.start.us.find(([lbl]) => lbl === p.label);
      home[p.id] = f ? { x: f[1], y: f[2] } : { x: q.x - (b0[0] - 30) * 0.45, y: q.y - (b0[1] - MIDY) * 0.2 };
    } else {
      home[p.id] = { x: (q.x - 0.3 * b0[0]) / 0.7, y: (q.y - 0.3 * b0[1]) / 0.7 };
    }
  }

  for (let k = 1; k < out.length; k++) {
    const prev = out[k - 1], cur = out[k];
    const b0 = ballPoint(prev.ball, prev.pos), b1 = ballPoint(cur.ball, cur.pos);
    const dx = b1[0] - b0[0], dy = b1[1] - b0[1];
    const scripted = new Set(prev.arrows.map(a => a.piece).filter(Boolean));
    const free = (p: Piece) => !scripted.has(p.id) && cur.ball.holder !== p.id && prev.ball.holder !== p.id && cur.pos[p.id];

    // the opponent nearest the ball presses it, between ball and their goal
    let presser: string | null = null, pd = Infinity;
    if (opts.them) for (const p of pieces) {
      if (p.side !== "them" || keepers.has(p.id) || !free(p)) continue;
      const q = prev.pos[p.id], d = Math.hypot(q.x - b1[0], q.y - b1[1]);
      if (d < pd) { pd = d; presser = p.id; }
    }

    for (const p of pieces) {
      if (!free(p) || (p.side === "us" ? !opts.us : !opts.them)) continue;
      const q = prev.pos[p.id];
      let next: Pos;
      if (keepers.has(p.id)) {
        const gx = p.side === "us" ? 1.5 : L - 1.5;
        next = { x: gx, y: clamp(MIDY + (b1[1] - MIDY) * 0.06, MIDY - 1.6, MIDY + 1.6), dir: 0 };
      } else if (p.side === "us" && !scriptedEver.has(p.id)) {
        const h = home[p.id];
        next = { x: clamp(h.x + (b1[0] - 30) * 0.45, 2, L - 5), y: clamp(h.y + (b1[1] - MIDY) * 0.2, 2, W - 2), dir: 0 };
      } else if (p.side === "us") {
        next = { x: clamp(q.x + dx * 0.45, 2, L - 2), y: clamp(q.y + dy * 0.2, 2, W - 2), dir: 0 };
      } else if (p.id === presser) {
        const gx = L - b1[0], gy = MIDY - b1[1], m = Math.hypot(gx, gy) || 1;
        next = { x: b1[0] + (gx / m) * 2.5, y: b1[1] + (gy / m) * 2.5, dir: 0 };
      } else if (!scriptedEver.has(p.id)) {
        const h = home[p.id];
        next = { x: clamp(h.x + (b1[0] - h.x) * 0.3, 30, L - 2), y: clamp(h.y + (b1[1] - h.y) * 0.3, 2, W - 2), dir: 0 };
      } else {
        next = { x: clamp(q.x + dx * 0.3 + (b1[0] - q.x) * 0.08, 2, L - 2), y: clamp(q.y + dy * 0.3 + (b1[1] - q.y) * 0.08, 2, W - 2), dir: 0 };
      }
      next.dir = facing(next, b1);
      cur.pos[p.id] = next;
    }
  }
  return out;
}
