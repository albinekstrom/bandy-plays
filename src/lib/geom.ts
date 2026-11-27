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

/** Ramer–Douglas–Peucker: keep the shape of a finger stroke with few points. */
export function simplify(pts: Pt[], eps = 0.6): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const len = dist(a, b) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

/** Dense Catmull-Rom samples through the points: used both to draw and to move along. */
export function smooth(pts: Pt[], per = 8): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [];
  const n = pts.length;
  for (let k = 0; k < n - 1; k++) {
    const p0 = pts[Math.max(k - 1, 0)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(k + 2, n - 1)];
    for (let s = 0; s < per; s++) {
      const u = s / per, u2 = u * u, u3 = u2 * u;
      const c = (i: 0 | 1) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[n - 1]);
  return out;
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
