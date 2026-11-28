import type { Pt } from "./types";

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/** Shortest-way interpolation between two angles in degrees. */
export function lerpAngle(a: number, b: number, u: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * u;
}

/** Point at fraction u (0–1) of the polyline's length. */
export function along(pts: Pt[], u: number): Pt {
  return samplePath(measurePath(pts), u);
}

export function measurePath(points: Pt[]) {
  let length = 0;
  const distances = points.map((point, i) => {
    if (i > 0) length += dist(points[i - 1], point);
    return length;
  });
  return { points, distances, length };
}

export function samplePath({ points, distances, length }: ReturnType<typeof measurePath>, u: number): Pt {
  if (!length || u <= 0) return points[0];
  if (u >= 1) return points[points.length - 1];
  const target = u * length;
  let lo = 1, hi = distances.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (distances[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const start = distances[lo - 1];
  const f = (target - start) / (distances[lo] - start);
  return [lerp(points[lo - 1][0], points[lo][0], f), lerp(points[lo - 1][1], points[lo][1], f)];
}

/** A wavy copy of a polyline, for "driver" (dribble) arrows. */
export function wavy(pts: Pt[], amp = 0.35, freq = 1.3): Pt[] {
  const out: Pt[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    if (i > 0) s += dist(o, p);
    const dx = q[0] - o[0], dy = q[1] - o[1], d = Math.hypot(dx, dy) || 1;
    const w = i === 0 || i === pts.length - 1 ? 0 : Math.sin(s * freq) * amp;
    out.push([p[0] - (dy / d) * w, p[1] + (dx / d) * w]);
  }
  return out;
}

export const pathD = (pts: Pt[]) =>
  pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");

/* ---------- stroke fitting: players skate straight or in one turn ---------- */

function offLine(p: Pt, a: Pt, b: Pt) {
  const len = dist(a, b);
  if (len < 1e-6) return dist(p, a);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
}

/** Points every `step` metres along a polyline. */
export function resample(pts: Pt[], step = 0.5): Pt[] {
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1], pts[i]];
    const d = dist(p, q);
    let at = step - carry;
    while (at <= d) {
      out.push([lerp(p[0], q[0], at / d), lerp(p[1], q[1], at / d)]);
      at += step;
    }
    carry = d - (at - step);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > 1e-6) out.push(last);
  return out;
}

/** Ramer–Douglas–Peucker: few waypoints, same shape. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = offLine(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Turn a finger stroke into waypoints: a straight line if it is nearly straight,
    otherwise the drawn curve with the hand jitter smoothed out. */
export function fitStroke(raw: Pt[]): Pt[] {
  const a = raw[0], b = raw[raw.length - 1];
  let dev = 0;
  for (const p of raw) dev = Math.max(dev, offLine(p, a, b));
  // wobble within ~12 % of the length (at least 1.5 m) counts as straight
  if (raw.length < 3 || dev < Math.max(1.5, 0.12 * dist(a, b))) return [a, b];

  // even spacing, then a moving average (~2 m) whose window shrinks towards the
  // ends, so the start, the end and their directions stay where they were drawn
  const pts = resample(raw, 0.5);
  const R = 4;
  let cur = pts;
  for (let pass = 0; pass < 2; pass++) {
    cur = cur.map((p, i) => {
      const r = Math.min(R, i, cur.length - 1 - i);
      if (r === 0) return p;
      let x = 0, y = 0;
      for (let j = i - r; j <= i + r; j++) { x += cur[j][0]; y += cur[j][1]; }
      return [x / (2 * r + 1), y / (2 * r + 1)] as Pt;
    });
  }
  return simplify(cur, 0.25);
}

/** Smooth curve through waypoints (centripetal Catmull-Rom: no loops or overshoot). */
export function spline(pts: Pt[], step = 0.5): Pt[] {
  if (pts.length < 3) return resample(pts, step);
  const n = pts.length;
  const ext: Pt[] = [
    [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
    ...pts,
    [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]],
  ];
  const out: Pt[] = [pts[0]];
  for (let k = 1; k < ext.length - 2; k++) {
    const [p0, p1, p2, p3] = [ext[k - 1], ext[k], ext[k + 1], ext[k + 2]];
    const tj = (a: Pt, b: Pt) => Math.max(Math.sqrt(dist(a, b)), 1e-4);
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const segs = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let s = 1; s <= segs; s++) {
      const t = t1 + ((t2 - t1) * s) / segs;
      const mix = (a: Pt, b: Pt, ta: number, tb: number): Pt =>
        [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = mix(p0, p1, 0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
      const B1 = mix(A1, A2, 0, t2), B2 = mix(A2, A3, t1, t3);
      out.push(mix(B1, B2, t1, t2));
    }
  }
  return out;
}

/** Points along a straight line or quadratic turn (arrows saved before waypoints), about every `step` metres. */
export function curvePts(a: Pt, b: Pt, ctrl: Pt | null | undefined, step = 0.5): Pt[] {
  const c = ctrl ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const approx = dist(a, c) + dist(c, b);
  const n = Math.max(2, Math.ceil(approx / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export function polyLength(pts: Pt[]) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

export const heading = (from: Pt, to: Pt) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
