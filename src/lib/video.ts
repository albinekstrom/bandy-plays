/* Export a play's playback as a video file: every frame is drawn on a canvas
   with the 2D API (same look as the editor's SVG) and recorded in real time
   with MediaRecorder. Browser only. */
import type { Arrow, Piece, Pos, Pt, Step } from "./types";
import { L, W, MIDY, ZONE, zoneLabel } from "./rink";
import { arrowCurve, arrowKind, frameAt, plan, stillFrame, type Frame, type Plan } from "./play";
import { clamp } from "./geom";

export interface VideoOpts {
  name: string;
  pieces: Piece[];
  steps: Step[];
  /** Half width of the substitution zone (metres). */
  zone?: number;
  format?: "16:9" | "9:16";
  speed?: number;
  showText?: boolean;
  showThem?: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Draw into this canvas (e.g. a visible preview) instead of a hidden one. */
  canvas?: HTMLCanvasElement;
}

export interface VideoResult {
  blob: Blob;
  ext: "mp4" | "webm";
}

const C = {
  is: "#F5F8FA", frost: "#E3EAF0", isgra: "#C9D4DD", natt: "#0F1B2A", skiffer: "#5A6B7B",
  rod: "#D32F2F", rosa: "#E6007E", morkrosa: "#B0005F", gul: "#FFC20E", bla: "#0057A8", borta: "#6B7785",
  ice: "#FBFDFE",
};

const FPS = 30;
const TITLE = 1.5;   // title card, seconds
const FADE = 0.3;    // title card fades out over its last FADE seconds
const HOLD = 0.5;    // still on each step before it moves
const END = 2;       // still on the last step

/* ---------- timeline ---------- */

type Seg =
  | { kind: "title"; t0: number; dur: number }
  | { kind: "hold"; k: number; t0: number; dur: number }
  | { kind: "move"; k: number; t0: number; dur: number; plan: Plan };

function timeline(steps: Step[], speed: number) {
  const segs: Seg[] = [];
  let t = 0;
  const push = (s: Seg) => { segs.push(s); t += s.dur; };
  push({ kind: "title", t0: t, dur: TITLE });
  steps.forEach((s, k) => {
    const last = k === steps.length - 1;
    push({ kind: "hold", k, t0: t, dur: last ? END : HOLD });
    if (!last) {
      const p = plan(s, steps[k + 1]);
      push({ kind: "move", k, t0: t, dur: p.T / speed, plan: p });
    }
  });
  return { segs, total: t };
}

/** Length of the exported video in seconds (recording takes as long). */
export function videoDuration(opts: Pick<VideoOpts, "steps" | "speed">): number {
  if (!opts.steps.length) return 0;
  return timeline(opts.steps, opts.speed && opts.speed > 0 ? opts.speed : 1).total;
}

/* ---------- layout ---------- */

interface Layout {
  w: number; h: number; pad: number; portrait: boolean;
  head: { y: number; h: number; name: number; kicker: number };
  foot: { y: number; size: number; lines: number };
  rink: { x: number; y: number; w: number; h: number };
}

function layout(format: "16:9" | "9:16"): Layout {
  if (format === "9:16") {
    return {
      w: 720, h: 1280, pad: 36, portrait: true,
      head: { y: 48, h: 96, name: 56, kicker: 22 },
      foot: { y: 1070, size: 40, lines: 3 },
      rink: { x: 36, y: 160, w: 648, h: 896 },
    };
  }
  return {
    w: 1280, h: 720, pad: 40, portrait: false,
    head: { y: 26, h: 60, name: 40, kicker: 17 },
    foot: { y: 634, size: 32, lines: 2 },
    rink: { x: 40, y: 100, w: 1200, h: 518 },
  };
}

/* ---------- fonts ---------- */

function fonts() {
  let head = "", body = "";
  try {
    const cs = getComputedStyle(document.documentElement);
    head = cs.getPropertyValue("--font-head").trim();
    body = cs.getPropertyValue("--font-body").trim();
  } catch { /* no document styles */ }
  return {
    head: (head ? head + ", " : "") + `"Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", system-ui, sans-serif`,
    body: (body ? body + ", " : "") + `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  };
}
type Fonts = ReturnType<typeof fonts>;

async function loadFonts(f: Fonts) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`800 40px ${f.head}`, "ÅÄÖ"),
        document.fonts.load(`700 40px ${f.head}`, "ÅÄÖ"),
        document.fonts.load(`600 20px ${f.body}`, "ÅÄÖ"),
      ]),
      new Promise(r => setTimeout(r, 2000)),
    ]);
  } catch { /* fall back to system fonts */ }
}

/* ---------- drawing ---------- */

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = px + "px";
}

/** Wrap text into at most `max` lines, the last one cut with an ellipsis if needed. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "", i = 0;
  for (; i < words.length; i++) {
    const t = cur ? cur + " " + words[i] : words[i];
    if (!cur || ctx.measureText(t).width <= width) { cur = t; continue; }
    if (lines.length === max - 1) break;
    lines.push(cur);
    cur = words[i];
  }
  if (i < words.length || ctx.measureText(cur).width > width) {
    while (cur.length > 1 && ctx.measureText(cur + "…").width > width) cur = cur.slice(0, -1).trimEnd();
    cur += "…";
  }
  lines.push(cur);
  return lines;
}

interface Scene {
  ctx: CanvasRenderingContext2D;
  lay: Layout;
  f: Fonts;
  name: string;
  pieces: Piece[];
  steps: Step[];
  zone: number;
  showText: boolean;
  showThem: boolean;
  side: Record<string, Piece["side"]>;
  scale: number; // px per metre
  world: DOMMatrix;
}

function makeScene(ctx: CanvasRenderingContext2D, lay: Layout, f: Fonts, o: Required<Pick<VideoOpts, "name" | "pieces" | "steps" | "zone" | "showText" | "showThem">>): Scene {
  // the editor's viewBox, standing (attack upwards) in portrait
  const vb = lay.portrait ? { x: -3, y: -4, w: 71, h: 113 } : { x: -4, y: -3, w: 113, h: 71 };
  const r = lay.rink;
  const s = Math.min(r.w / vb.w, r.h / vb.h);
  const ox = r.x + (r.w - vb.w * s) / 2 - vb.x * s;
  const oy = r.y + (r.h - vb.h * s) / 2 - vb.y * s;
  let world = new DOMMatrix([s, 0, 0, s, ox, oy]);
  if (lay.portrait) world = world.multiply(new DOMMatrix([0, -1, 1, 0, 0, L]));
  return {
    ctx, lay, f, ...o, scale: s, world,
    side: Object.fromEntries(o.pieces.map(p => [p.id, p.side])),
  };
}

const toWorld = (sc: Scene) => sc.ctx.setTransform(sc.world);

/** Upright text at a rink point, sized in metres. */
function rinkText(sc: Scene, x: number, y: number, text: string, sizeM: number, font: string, color: string, align: CanvasTextAlign, baseline: CanvasTextBaseline) {
  const { ctx } = sc;
  const p = sc.world.transformPoint(new DOMPoint(x, y));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, p.x, p.y);
  ctx.font = `${font} ${sizeM * sc.scale}px ${sc.f.body}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawRink(sc: Scene) {
  const { ctx } = sc;
  toWorld(sc);
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);
  // goals
  ctx.fillStyle = C.frost;
  ctx.strokeStyle = C.natt;
  ctx.lineWidth = 0.25;
  for (const x of [-2, L]) { ctx.fillRect(x, MIDY - 1.75, 2, 3.5); ctx.strokeRect(x, MIDY - 1.75, 2, 3.5); }
  // ice
  ctx.fillStyle = C.ice;
  ctx.fillRect(0, 0, L, W);
  // växlingszon
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = C.frost;
  const z = sc.zone;
  ctx.fillRect(0, MIDY - z, L, z * 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = C.isgra;
  ctx.lineWidth = 0.25;
  line(ctx, 0, MIDY, L, MIDY);
  ctx.lineWidth = 0.2;
  ctx.setLineDash([1, 1]);
  line(ctx, 0, MIDY - z, L, MIDY - z);
  line(ctx, 0, MIDY + z, L, MIDY + z);
  ctx.setLineDash([]);
  rinkText(sc, 1.5, MIDY - z - 0.6, zoneLabel(z), 1.4, "700", C.skiffer, "left", "alphabetic");
  toWorld(sc);
  // red markings
  ctx.strokeStyle = C.rod;
  ctx.fillStyle = C.rod;
  ctx.lineWidth = 0.25;
  ctx.strokeRect(0, 0, L, W);
  line(ctx, L / 2, 0, L / 2, W);
  const arc = (x: number, y: number, r: number, a: number, b: number) => {
    ctx.beginPath(); ctx.arc(x, y, r, a, b); ctx.stroke();
  };
  const P = Math.PI;
  arc(L / 2, MIDY, 5, 0, 2 * P);
  for (const r of [17, 5]) { arc(0, MIDY, r, -P / 2, P / 2); arc(L, MIDY, r, P / 2, 1.5 * P); }
  arc(0, 0, 1, 0, P / 2); arc(L, 0, 1, P / 2, P); arc(0, W, 1, -P / 2, 0); arc(L, W, 1, P, 1.5 * P);
  for (const x of [12, L / 2, L - 12]) { ctx.beginPath(); ctx.arc(x, MIDY, 0.3, 0, 2 * P); ctx.fill(); }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function polyline(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

/** The editor's marker: a 10-unit triangle scaled to 2.8 m, tip 0.84 m past the end. */
function arrowHead(ctx: CanvasRenderingContext2D, pts: Pt[], color: string) {
  const n = pts.length;
  if (n < 2) return;
  const [x, y] = pts[n - 1];
  let i = n - 2;
  while (i > 0 && Math.hypot(x - pts[i][0], y - pts[i][1]) < 1e-3) i--;
  const a = Math.atan2(y - pts[i][1], x - pts[i][0]);
  const u = 0.28;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-7 * u, -5 * u);
  ctx.lineTo(3 * u, 0);
  ctx.lineTo(-7 * u, 5 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArrows(sc: Scene, step: Step, next: Step | undefined, alpha: number) {
  const { ctx } = sc;
  toWorld(sc);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const a of step.arrows as Arrow[]) {
    if (a.piece && !sc.showThem && sc.side[a.piece] === "them") continue;
    const pts = arrowCurve(a, step, next);
    if (pts.length < 2) continue;
    const kind = arrowKind(a, step);
    const color = kind === "run" ? C.bla : C.rosa;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * (kind === "run" ? 0.8 : 1);
    if (kind === "pass") { ctx.lineWidth = 0.35; ctx.setLineDash(a.lob ? [1.2, 0.8] : [0.1, 0.9]); }
    else { ctx.lineWidth = kind === "drib" ? 0.4 : 0.3; ctx.setLineDash([]); }
    polyline(ctx, pts);
    ctx.setLineDash([]);
    arrowHead(ctx, pts, color);
  }
  ctx.globalAlpha = 1;
}

function drawPieces(sc: Scene, pos: Record<string, Pos>, holder: string | null) {
  const { ctx } = sc;
  const P = Math.PI;
  for (const pc of sc.pieces) {
    if (pc.side === "them" && !sc.showThem) continue;
    const p = pos[pc.id];
    if (!p) continue;
    const us = pc.side === "us";
    const fill = us ? C.bla : C.borta;
    toWorld(sc);
    ctx.translate(p.x, p.y);
    // nose
    ctx.save();
    ctx.rotate((p.dir * P) / 180);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(1.15, -0.75); ctx.lineTo(2.05, 0); ctx.lineTo(1.15, 0.75); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // body
    ctx.beginPath();
    ctx.arc(0, 0, us ? 1.4 : 1.2, 0, 2 * P);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = us ? C.gul : "#fff";
    ctx.lineWidth = us ? (holder === pc.id ? 0.55 : 0.35) : 0.3;
    ctx.stroke();
    if (pc.label) rinkText(sc, p.x, p.y, pc.label, pc.label.length > 1 ? 1 : 1.15, "700", "#fff", "center", "middle");
  }
}

function drawBall(sc: Scene, b: Pt, lift = 0, arc = 0) {
  const { ctx } = sc;
  toWorld(sc);
  if (lift > 0) { // a lob: shadow on the ice, the ball above it and bigger
    ctx.beginPath();
    ctx.arc(b[0], b[1], 0.5, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(15,27,42,.25)";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(b[0], b[1] - arc, 0.6 * (1 + 0.8 * lift), 0, 2 * Math.PI);
  ctx.fillStyle = C.rosa;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 0.15;
  ctx.stroke();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, size: number, min: number, width: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > width) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

function drawHeader(sc: Scene, k: number) {
  const { ctx, lay, f } = sc;
  const { head, pad, w } = lay;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.rod;
  ctx.fillRect(pad, head.y, lay.portrait ? 6 : 5, head.h);
  const x = pad + (lay.portrait ? 20 : 16);
  // step counter on the right
  const count = `${k + 1}/${sc.steps.length}`;
  ctx.font = `800 ${head.name * 0.8}px ${f.head}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.skiffer;
  setSpacing(ctx, 0);
  ctx.fillText(count, w - pad, head.y + head.h - 4);
  const countW = ctx.measureText(count).width + 24;
  // kicker + name
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 ${head.kicker}px ${f.body}`;
  ctx.fillStyle = C.morkrosa;
  ctx.fillText("Bandyspel", x, head.y);
  const nm = (sc.name || "Namnlöst spel").toUpperCase();
  setSpacing(ctx, head.name * 0.02);
  fitFont(ctx, nm, "800", f.head, head.name, Math.round(head.name * 0.6), w - pad - countW - x);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.natt;
  ctx.fillText(wrap(ctx, nm, w - pad - countW - x, 1)[0], x, head.y + head.h - 4);
  setSpacing(ctx, 0);
}

function drawCaption(sc: Scene, k: number) {
  const { ctx, lay, f } = sc;
  const { foot, pad, w } = lay;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.rod;
  ctx.fillRect(pad, foot.y, w - 2 * pad, 3);
  const label = `Steg ${k + 1}/${sc.steps.length}`.toUpperCase();
  const text = sc.showText ? sc.steps[k].text.trim().toUpperCase() : "";
  const width = w - 2 * pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  setSpacing(ctx, foot.size * 0.02);
  const full = label + (text ? " · " + text : "");
  // shrink a little before cutting long text
  const min = Math.round(foot.size * 0.75);
  let size = foot.size;
  for (;;) {
    ctx.font = `800 ${size}px ${f.head}`;
    if (size <= min || wrap(ctx, full, width, 99).length <= foot.lines) break;
    size -= 2;
  }
  const lines = wrap(ctx, full, width, foot.lines);
  const lh = size * 1.1;
  let y = foot.y + 12;
  lines.forEach((ln, i) => {
    let x = pad;
    if (i === 0 && ln.startsWith(label)) {
      ctx.fillStyle = C.skiffer;
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width;
      ln = ln.slice(label.length);
    }
    ctx.fillStyle = C.natt;
    ctx.fillText(ln, x, y);
    y += lh;
  });
  setSpacing(ctx, 0);
}

function drawTitle(sc: Scene, alpha: number) {
  const { ctx, lay, f } = sc;
  const { w, h, pad } = lay;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.natt;
  ctx.fillRect(0, 0, w, h);
  const big = lay.portrait ? 96 : 112;
  const x = pad + (lay.portrait ? 28 : 40);
  const width = w - x - pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  setSpacing(ctx, big * 0.02);
  const nm = (sc.name || "Namnlöst spel").toUpperCase();
  let size = big, lines: string[] = [];
  for (; size >= big * 0.5; size -= 4) {
    ctx.font = `800 ${size}px ${f.head}`;
    lines = wrap(ctx, nm, width, 3);
    if (!lines.some(l => l.endsWith("…"))) break;
  }
  ctx.font = `800 ${size}px ${f.head}`;
  const lh = size * 0.98;
  const kick = lay.portrait ? 30 : 26, sub = lay.portrait ? 34 : 30;
  const blockH = kick + 16 + lines.length * lh + 20 + sub;
  let y = (h - blockH) / 2;
  ctx.fillStyle = C.rod;
  ctx.fillRect(pad, y - 6, 8, blockH + 12);
  setSpacing(ctx, 0);
  ctx.font = `600 ${kick}px ${f.body}`;
  ctx.fillStyle = C.rosa;
  ctx.textBaseline = "top";
  ctx.fillText("Bandyspel", x, y);
  y += kick + 16;
  ctx.font = `800 ${size}px ${f.head}`;
  setSpacing(ctx, size * 0.02);
  ctx.fillStyle = "#fff";
  for (const ln of lines) { ctx.fillText(ln, x, y); y += lh; }
  y += 20;
  setSpacing(ctx, sub * 0.06);
  ctx.font = `700 ${sub}px ${f.head}`;
  ctx.fillStyle = C.isgra;
  const n = sc.steps.length;
  ctx.fillText(`${n} STEG · VI ANFALLER ${lay.portrait ? "UPPÅT" : "ÅT HÖGER"}`, x, y);
  setSpacing(ctx, 0);
  ctx.globalAlpha = 1;
}

function drawScene(sc: Scene, k: number, frame: Frame, arrowAlpha: number) {
  const { ctx, lay } = sc;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.is;
  ctx.fillRect(0, 0, lay.w, lay.h);
  drawRink(sc);
  drawArrows(sc, sc.steps[k], sc.steps[k + 1], arrowAlpha);
  drawPieces(sc, frame.pos, sc.steps[k].ball.holder);
  drawBall(sc, frame.ball, frame.lift ?? 0, frame.arc ?? 0);
  drawHeader(sc, k);
  drawCaption(sc, k);
}

/** Draw the video frame at time t (seconds). */
function drawAt(sc: Scene, segs: Seg[], t: number) {
  const seg = segs.find(s => t < s.t0 + s.dur) ?? segs[segs.length - 1];
  if (seg.kind === "title") {
    drawScene(sc, 0, stillFrame(sc.steps[0]), 1);
    drawTitle(sc, clamp((seg.t0 + seg.dur - t) / FADE, 0, 1));
  } else if (seg.kind === "hold") {
    drawScene(sc, seg.k, stillFrame(sc.steps[seg.k]), 1);
  } else {
    const u = clamp((t - seg.t0) / seg.dur, 0, 1);
    const fade = 1 - 0.65 * clamp((t - seg.t0) / 0.25, 0, 1); // arrows dim to .35 as in the editor
    drawScene(sc, seg.k, frameAt(seg.plan, u * seg.plan.T), fade);
  }
}

/* ---------- recording ---------- */

const TYPES: [string, "mp4" | "webm"][] = [
  ["video/mp4;codecs=avc1", "mp4"],
  ["video/mp4;codecs=avc1.42E01F", "mp4"],
  ["video/mp4", "mp4"],
  ["video/webm;codecs=vp9", "webm"],
  ["video/webm;codecs=vp8", "webm"],
  ["video/webm", "webm"],
];

function pickType(): [string, "mp4" | "webm"] | null {
  for (const t of TYPES) if (MediaRecorder.isTypeSupported(t[0])) return t;
  return null;
}

const abortError = () => new DOMException("Videoexporten avbröts.", "AbortError");

export async function exportVideo(opts: VideoOpts): Promise<VideoResult> {
  const { signal } = opts;
  if (signal?.aborted) throw abortError();
  if (!opts.steps.length) throw new Error("Spelet har inga steg att visa.");
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined")
    throw new Error("Den här webbläsaren kan inte spela in video. Prova Chrome, Edge, Firefox eller Safari i en nyare version.");
  const canvas = opts.canvas ?? document.createElement("canvas");
  if (typeof canvas.captureStream !== "function")
    throw new Error("Den här webbläsaren kan inte spela in video från en bild (captureStream saknas). Prova Chrome, Edge, Firefox eller Safari i en nyare version.");
  const type = pickType();
  if (!type) throw new Error("Den här webbläsaren kan inte skapa MP4- eller WebM-video.");

  const lay = layout(opts.format ?? "16:9");
  canvas.width = lay.w;
  canvas.height = lay.h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Kunde inte rita videon (canvas saknas).");
  const f = fonts();
  await loadFonts(f);
  if (signal?.aborted) throw abortError();

  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const sc = makeScene(ctx, lay, f, {
    name: opts.name, pieces: opts.pieces, steps: opts.steps, zone: opts.zone ?? ZONE,
    showText: opts.showText ?? true, showThem: opts.showThem ?? true,
  });
  const { segs, total } = timeline(opts.steps, speed);

  // a canvas we made ourselves must sit in the document for some browsers to capture it
  let hidden: HTMLElement | null = null;
  if (!opts.canvas) {
    hidden = canvas;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none;";
    document.body.appendChild(canvas);
  }

  drawAt(sc, segs, 0);
  const stream = canvas.captureStream(FPS);
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { mimeType: type[0], videoBitsPerSecond: 5_000_000 });
  } catch {
    stream.getTracks().forEach(t => t.stop());
    hidden?.remove();
    throw new Error("Den här webbläsaren kunde inte starta videoinspelningen.");
  }

  return new Promise<VideoResult>((resolve, reject) => {
    const chunks: Blob[] = [];
    let raf = 0, done = false, aborted = false, start = 0, lastReport = -1;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      signal?.removeEventListener("abort", onAbort);
      stream.getTracks().forEach(t => t.stop());
      hidden?.remove();
    };
    const onAbort = () => {
      if (done) return;
      aborted = true;
      if (rec.state !== "inactive") rec.stop(); else { cleanup(); reject(abortError()); }
    };
    signal?.addEventListener("abort", onAbort);

    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Videoinspelningen misslyckades."));
    };
    rec.onstop = () => {
      if (done) return;
      done = true;
      cleanup();
      if (aborted) { reject(abortError()); return; }
      const mime = rec.mimeType || type[0];
      const ext: "mp4" | "webm" = mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm" : type[1];
      const blob = new Blob(chunks, { type: mime.split(";")[0] || (ext === "mp4" ? "video/mp4" : "video/webm") });
      if (!blob.size) { reject(new Error("Videon blev tom. Försök igen med fliken öppen.")); return; }
      opts.onProgress?.(1);
      resolve({ blob, ext });
    };

    const tick = (now: number) => {
      if (done || aborted) return;
      if (!start) start = now;
      const t = (now - start) / 1000;
      drawAt(sc, segs, Math.min(t, total));
      const p = Math.min(1, t / total);
      if (p - lastReport >= 0.005) { lastReport = p; opts.onProgress?.(p); }
      if (t >= total + 0.15) { rec.stop(); return; } // a few extra frames so the last one is kept
      raf = requestAnimationFrame(tick);
    };

    rec.start(1000);
    opts.onProgress?.(0);
    raf = requestAnimationFrame(tick);
  });
}
