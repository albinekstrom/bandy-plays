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
  if (pts.length === 1) return pts[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); seg.push(d); total += d; }
  if (total === 0) return pts[0];
  let want = clamp(u, 0, 1) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? want / seg[i] : 0;
      return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
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

/** Snap a finger stroke to a straight line (ctrl = null) or a single smooth turn. */
export function fitStroke(raw: Pt[]): { a: Pt; b: Pt; ctrl: Pt | null } {
  const a = raw[0], b = raw[raw.length - 1];
  const chord = dist(a, b);
  let dev = 0;
  for (const p of raw) dev = Math.max(dev, offLine(p, a, b));
  // wobble within ~12 % of the length (at least 1.5 m) counts as straight
  if (raw.length < 3 || dev < Math.max(1.5, 0.12 * chord)) return { a, b, ctrl: null };

  // least-squares control point for a quadratic Bézier, chord-length parameters
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + dist(raw[i - 1], raw[i]));
  const total = cum[cum.length - 1] || 1;
  let nx = 0, ny = 0, den = 0;
  raw.forEach((p, i) => {
    const t = cum[i] / total, w = 2 * t * (1 - t);
    const rx = (1 - t) ** 2 * a[0] + t * t * b[0], ry = (1 - t) ** 2 * a[1] + t * t * b[1];
    nx += w * (p[0] - rx); ny += w * (p[1] - ry); den += w * w;
  });
  if (den < 1e-9) return { a, b, ctrl: null };
  return { a, b, ctrl: [nx / den, ny / den] };
}

/** Points along a straight line or quadratic turn, about every `step` metres. */
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
