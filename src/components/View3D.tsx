"use client";
/* Stand in a player's skates: the rink in 3D from his eye height, looking the way
   he faces in the current step. Drag to turn the head. Teammates hidden behind
   someone get a ring; teammates off-screen get an arrow at the edge.
   The play can run in 3D (step by step or all of it), seen from his eyes or from
   a camera in the stands, behind our goal or above the rink. The scene is built
   once per environment and viewer; playback only moves objects. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Piece, Pos, Pt, Step } from "@/lib/types";
import { L, W, MIDY, NAMES } from "@/lib/rink";
import { clamp, lerp } from "@/lib/geom";
import { ballPoint, frameAt, plan as planMove, type Plan } from "@/lib/play";
import { ENVIRONMENTS, loadEnv, saveEnv, type EnvId } from "./three/environments";
import { buildSkater, KIT_THEM, KIT_US } from "./three/skater";

const EYE = 1.55; // eye height in a skating stance
const C = { line: 0xd32f2f, ball: 0xe6007e };
const DEG = Math.PI / 180;
const OVERLAY = 1; // layer for labels and rings: the ice mirror's camera doesn't see it

type Status = "clear" | "partial" | "hidden";
interface Edge { id: string; label: string; x: number; y: number; angle: number }
interface Hud { edges: Edge[]; hidden: number; partial: number }
interface Pose { pos: Record<string, Pos>; ball: Pt; holder: string | null; lift?: number }
interface Playback { idx: number; t: number; plan: Plan; all: boolean; hold: number; running: boolean }

export type CamMode = "eyes" | "stand" | "goal" | "top";
const CAMS: { id: CamMode; label: string; hint: string }[] = [
  { id: "eyes", label: "Ögon", hint: "Dra för att vrida huvudet." },
  { id: "stand", label: "Läktare", hint: "Dra för att svänga kameran." },
  { id: "goal", label: "Bakom mål", hint: "Dra för att svänga kameran." },
  { id: "top", label: "Ovanifrån", hint: "Dra för att vrida planen." },
];

/* Where the broadcast cameras stand in each environment, and the box they must stay
   in when you swing them (the hall has walls 13–14 m outside the lines and a low roof). */
const SPOTS: Record<EnvId, { stand: { z: number; y: number }; goal: { x: number; y: number }; box?: [number, number, number, number, number] }> = {
  hall: { stand: { z: -11.5, y: 7.2 }, goal: { x: -12.5, y: 7.2 }, box: [-13, L + 13, -12, W + 16, 7.6] },
  outdoor: { stand: { z: -18, y: 12 }, goal: { x: -14, y: 8 } },
  arena: { stand: { z: -18, y: 11.5 }, goal: { x: -14, y: 8 } },
};
// Ovanifrån: cut away everything higher than this (roofs, walls, stands, trees)
const TOP_CLIP = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 5)];
const NO_CLIP: THREE.Plane[] = [];

const stillPose = (s: Step): Pose => ({ pos: s.pos, ball: ballPoint(s.ball, s.pos), holder: s.ball.holder });

/** Who has the ball t seconds into a move (null while a pass is in the air). */
function holderAt(pl: Plan, t: number) {
  const { a, b, pass } = pl;
  if (pass) return t < pass.start ? a.ball.holder : t >= pass.start + pass.flight ? b.ball.holder : null;
  return t >= pl.T ? b.ball.holder : a.ball.holder;
}

/* Is the line from the eye to a teammate's chest / head blocked by another body?
   Bodies are upright cylinders (r 0.3 m, from 0.2 m up to the top of the head). */
export function sightlines(pieces: Piece[], pos: Record<string, Pos>, viewer: string): Record<string, Status> {
  const me = pos[viewer], side = pieces.find(p => p.id === viewer)?.side;
  const out: Record<string, Status> = {};
  if (!me) return out;
  for (const mate of pieces) {
    const t = pos[mate.id];
    if (!t || mate.id === viewer || mate.side !== side) continue;
    const blocked = [1.15, 1.62].filter(h => pieces.some(o => {
      const q = pos[o.id];
      if (!q || o.id === viewer || o.id === mate.id) return false;
      const dx = t.x - me.x, dy = t.y - me.y, len2 = dx * dx + dy * dy;
      const u = ((q.x - me.x) * dx + (q.y - me.y) * dy) / len2;
      if (u <= 0 || u >= 1 - 0.35 / Math.sqrt(len2)) return false;
      const off = Math.hypot(me.x + u * dx - q.x, me.y + u * dy - q.y);
      const z = EYE + u * (h - EYE);
      return off < 0.3 && z > 0.2 && z < 1.76;
    })).length;
    out[mate.id] = blocked === 2 ? "hidden" : blocked === 1 ? "partial" : "clear";
  }
  return out;
}

function textSprite(text: string, bg: string, fg = "#fff") {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = bg; g.fillRect(8, 8, 112, 48);
  g.fillStyle = fg; g.font = "bold 34px Inter, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 64, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
  s.scale.set(0.07, 0.035, 1);
  s.renderOrder = 10;
  s.layers.set(OVERLAY);
  return s;
}

function ringSprite(color: string, dashed: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = color; g.lineWidth = 10;
  if (dashed) g.setLineDash([16, 12]);
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
  s.scale.set(0.06, 0.06, 1);
  s.renderOrder = 9;
  s.layers.set(OVERLAY);
  s.visible = false;
  return s;
}

function buildRink(scene: THREE.Scene) {
  const flat = (geo: THREE.BufferGeometry, color: number, y: number, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  const lw = 0.12, y = 0.006; // painted lines, just above the hall's ice
  // outline and centre line
  flat(new THREE.PlaneGeometry(L, lw), C.line, y, L / 2, 0);
  flat(new THREE.PlaneGeometry(L, lw), C.line, y, L / 2, W);
  flat(new THREE.PlaneGeometry(lw, W), C.line, y, 0, MIDY);
  flat(new THREE.PlaneGeometry(lw, W), C.line, y, L, MIDY);
  flat(new THREE.PlaneGeometry(lw, W), C.line, y, L / 2, MIDY);
  const ring = (r: number, start: number, len: number, x: number) =>
    flat(new THREE.RingGeometry(r - lw / 2, r + lw / 2, 96, 1, start, len), C.line, y, x, MIDY);
  ring(5, 0, Math.PI * 2, L / 2);
  ring(17, -Math.PI / 2, Math.PI, 0); ring(17, Math.PI / 2, Math.PI, L);
  ring(5, -Math.PI / 2, Math.PI, 0); ring(5, Math.PI / 2, Math.PI, L);
  for (const x of [12, L / 2, L - 12]) flat(new THREE.CircleGeometry(0.3, 24), C.line, y, x, MIDY);
  // goals: 3.5 m wide, 2.1 m high
  const post = new THREE.MeshStandardMaterial({ color: 0xd8462b, roughness: 0.5 });
  const net = new THREE.MeshStandardMaterial({ color: 0xe8edf1, transparent: true, opacity: 0.4 });
  for (const [x, back] of [[0, -1.5], [L, L + 1.5]] as const) {
    for (const dz of [-1.75, 1.75]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), post);
      p.position.set(x, 1.05, MIDY + dz);
      scene.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.5), post);
    bar.position.set(x, 2.1, MIDY);
    scene.add(bar);
    const n = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(back - x), 2.1, 3.5), net);
    n.position.set((x + back) / 2, 1.05, MIDY);
    scene.add(n);
  }
}

interface Player {
  id: string;
  sk: ReturnType<typeof buildSkater>;
  t: number;          // stride clock
  moved: boolean;     // moved since the last frame: stride faster
  self: boolean;
  tag: string;
  label: THREE.Sprite | null;
  rings: [THREE.Sprite, THREE.Sprite] | null; // hidden, partly hidden
  chest: THREE.Vector3;
}

export default function View3D({ pieces, step, steps, speed = 1, viewer, k, count, onStep, onViewer, onClose }: {
  pieces: Piece[];
  step: Step;
  /** The line of steps being viewed (step === steps[k]); playback needs at least two. */
  steps?: Step[];
  /** Playback rate multiplier. */
  speed?: number;
  viewer: string;
  k: number;
  count: number;
  onStep: (k: number) => void;
  /** Switch whose eyes we see through (any player on the ice); hidden when not given. */
  onViewer?: (id: string) => void;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [envId, setEnvId] = useState<EnvId>(loadEnv);
  const pickEnv = (id: EnvId) => { setEnvId(id); saveEnv(id); };
  const [cam, setCam] = useState<CamMode>("eyes");
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState<Hud>({ edges: [], hidden: 0, partial: 0 });
  const line = useMemo(() => steps ?? [step], [steps, step]);
  const me = pieces.find(p => p.id === viewer);
  // everyone on the ice in this step: our players by position, opponents numbered
  const onIce = pieces.filter(p => step.pos[p.id]);
  const ours = onIce.filter(p => p.side === "us");
  const theirs = onIce.filter(p => p.side === "them");
  const nameOf = (p: Piece, i: number) => (p.label ? NAMES[p.label] ?? p.label : `Motståndare ${i + 1}`);
  const myName = me ? nameOf(me, Math.max(0, theirs.indexOf(me))) : "";

  // shared with the render loop, which outlives renders
  const poseRef = useRef<Pose>(stillPose(step));
  const camRef = useRef<CamMode>("eyes");
  const lookRef = useRef({ yaw: 0, pitch: 0 }); // drag offset on top of the camera's own aim
  const playRef = useRef<Playback | null>(null);
  const sceneRef = useRef<{ apply: () => void; camChanged: () => void; setViewer: (id: string) => void } | null>(null);
  const viewerRef = useRef(viewer);
  const live = useRef({ steps: line, onStep, speed });
  useEffect(() => { live.current = { steps: line, onStep, speed }; });

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const env = (ENVIRONMENTS.find(e => e.id === envId) ?? ENVIRONMENTS[0]).build(scene, renderer);
    const { mirror } = env;
    const spot = SPOTS[envId] ?? SPOTS.hall;
    buildRink(scene);

    /* ---------- players and ball: built once, moved every frame ---------- */
    const players: Player[] = pieces.map((pc, i) => {
      const sk = buildSkater(pc.side === "us" ? KIT_US : KIT_THEM, { phase: (i * 2.399) % (Math.PI * 2), holder: false });
      scene.add(sk.root);
      return { id: pc.id, sk, t: 0, moved: false, self: false, tag: pc.label || "M", label: null, rings: null, chest: new THREE.Vector3() };
    });
    let mates: Player[] = [];
    const drop = (s: THREE.Sprite | null) => { if (s) { scene.remove(s); s.material.map?.dispose(); s.material.dispose(); } };
    /* Whose eyes we see through: only his label, his teammates' labels and rings change,
       so switching viewer keeps the renderer, environment and skaters. */
    const setViewer = (id: string) => {
      viewerRef.current = id;
      const mySide = pieces.find(p => p.id === id)?.side ?? "us";
      for (const p of players) {
        drop(p.label);
        p.rings?.forEach(drop);
        const side = pieces.find(x => x.id === p.id)!.side;
        p.self = p.id === id;
        const mate = !p.self && side === mySide;
        p.label = p.self ? textSprite(p.tag, "#E6007E") : mate ? textSprite(p.tag, side === "us" ? "#0057A8" : "#6B7785") : null;
        p.rings = mate ? [ringSprite("#E6007E", true), ringSprite("#FFC20E", false)] : null;
        if (p.label) scene.add(p.label);
        if (p.rings) scene.add(...p.rings);
      }
      mates = players.filter(p => p.rings);
      snap = true;
      apply();
    };
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: C.ball, emissive: 0x550030, roughness: 0.4 }));
    scene.add(ball);

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dirty = true, hudDirty = true, sight: Record<string, Status> | null = null;

    /** Put everything where the current pose says. */
    const apply = () => {
      const pose = poseRef.current, eyes = camRef.current === "eyes";
      for (const p of players) {
        const q = pose.pos[p.id];
        const root = p.sk.root;
        root.visible = !!q && !(p.self && eyes);
        if (p.label) p.label.visible = !!q && !(p.self && eyes);
        if (!q) continue;
        p.moved ||= Math.abs(root.position.x - q.x) + Math.abs(root.position.z - q.y) > 1e-3;
        root.position.set(q.x, 0, q.y);
        root.rotation.y = -q.dir * DEG;
        p.label?.position.set(q.x, 2.05, q.y);
        p.chest.set(q.x, 1.15, q.y);
        if (p.rings) { p.rings[0].position.copy(p.chest); p.rings[1].position.copy(p.chest); }
        p.sk.setHolder(pose.holder === p.id);
      }
      ball.position.set(pose.ball[0], 0.08 + (pose.lift ?? 0) * 3, pose.ball[1]); // a lob flies up to ~3 m
      // rings for teammates hidden behind someone: only from his eyes
      sight = eyes ? sightlines(pieces, pose.pos, viewerRef.current) : null;
      for (const p of mates) {
        const st = sight?.[p.id];
        p.rings![0].visible = st === "hidden";
        p.rings![1].visible = st === "partial";
      }
      dirty = hudDirty = true;
    };

    /* ---------- camera ---------- */
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    camera.layers.enable(OVERLAY);
    let w = 1, h = 1;
    const look = new THREE.Vector3(), at = new THREE.Vector3(), from = new THREE.Vector3(), corner = new THREE.Vector3();
    let fx = poseRef.current.ball[0], fz = poseRef.current.ball[1], snap = true;
    /* Ovanifrån: attack to the right (upwards on a standing screen), as on the board.
       Find the distance and shift that fit the whole rink between the header and the footer. */
    const TOP_PITCH = -1.25;
    const top = { yaw: 0, d: 120, s: 0 };
    const fitTop = () => {
      const root = host.parentElement;
      const head = root?.querySelector<HTMLElement>(".v3d-top")?.offsetHeight ?? 0;
      const foot = root?.querySelector<HTMLElement>(".v3d-foot")?.offsetHeight ?? 0;
      let hi = 1 - (2 * head) / h, lo = -1 + (2 * foot) / h;
      if (hi - lo < 0.5) { hi = 0.9; lo = -0.9; }
      top.yaw = camera.aspect >= 1 ? -Math.PI / 2 : 0;
      const gx = Math.cos(top.yaw), gz = Math.sin(top.yaw);
      look.set(gx * Math.cos(TOP_PITCH), Math.sin(TOP_PITCH), gz * Math.cos(TOP_PITCH));
      for (let i = 0; i < 12; i++) {
        at.set(L / 2 + gx * top.s, 0, MIDY + gz * top.s);
        camera.position.copy(at).addScaledVector(look, -top.d);
        camera.lookAt(at);
        camera.updateMatrixWorld();
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        for (const [cx, cz] of [[-3, -2], [L + 3, -2], [-3, W + 2], [L + 3, W + 2]]) {
          corner.set(cx, 0, cz).project(camera);
          x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
          y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
        }
        const scale = Math.max((x1 - x0) / 1.9, (y1 - y0) / (hi - lo)), off = (hi + lo) / 2 - (y0 + y1) / 2;
        top.d *= scale;
        top.s -= (off * top.d * Math.tan((camera.fov * DEG) / 2)) / Math.sin(-TOP_PITCH);
        if (Math.abs(scale - 1) < 0.005 && Math.abs(off) < 0.005) break;
      }
    };
    const lens = () => {
      w = host.clientWidth || 1; h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      const aspect = w / h, mode = camRef.current;
      // eyes: ~95° wide where the screen allows it, never taller than 75°; cameras: ~70° / 60°
      const [hor, cap] = mode === "eyes" ? [95, 75] : [70, 60];
      camera.fov = Math.min(cap, (2 * Math.atan(Math.tan((hor * DEG) / 2) / aspect)) / DEG);
      camera.aspect = aspect;
      // a near plane as far out as the mode allows keeps the ice, its mirror and the lines apart
      camera.near = mode === "eyes" ? 0.05 : 0.5;
      camera.far = 400;
      camera.updateProjectionMatrix();
      if (mode === "top") {
        fitTop();
        camera.near = Math.max(1, top.d * 0.4);
        camera.far = top.d * 2 + 100;
        camera.updateProjectionMatrix();
      }
      dirty = hudDirty = true;
    };
    const place = (dt: number) => {
      const mode = camRef.current, pose = poseRef.current, off = lookRef.current;
      // broadcast cameras follow the ball softly
      const a = snap || still ? 1 : 1 - Math.exp(-dt * 2.2);
      snap = false;
      fx += (pose.ball[0] - fx) * a;
      fz += (pose.ball[1] - fz) * a;
      if (mode === "eyes") {
        const q = pose.pos[viewerRef.current];
        if (q) from.set(q.x, EYE, q.y);
        const yaw = (q ? q.dir * DEG : 0) + off.yaw, pitch = clamp(-0.12 + off.pitch, -1.2, 0.6);
        look.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
        camera.position.copy(from);
        camera.lookAt(at.copy(from).add(look));
      } else {
        let yaw0: number, pitch0: number, d: number;
        if (mode === "top") {
          pitch0 = TOP_PITCH;
          yaw0 = top.yaw;
          d = top.d;
          at.set(L / 2 + Math.cos(top.yaw) * top.s, 0, MIDY + Math.sin(top.yaw) * top.s);
        } else {
          if (mode === "stand") {
            const x = clamp(fx, 14, L - 14);
            from.set(x, spot.stand.y, spot.stand.z);
            at.set(x, 0, lerp(MIDY, fz, 0.3));
          } else {
            from.set(spot.goal.x, spot.goal.y, lerp(MIDY, fz, 0.15));
            at.set(lerp(L * 0.42, fx, 0.5), 0, lerp(MIDY, fz, 0.5));
          }
          const dx = at.x - from.x, dy = at.y - from.y, dz = at.z - from.z, hd = Math.hypot(dx, dz);
          yaw0 = Math.atan2(dz, dx);
          pitch0 = Math.atan2(dy, hd);
          d = Math.hypot(hd, dy);
        }
        // drag swings the camera around the point it looks at
        const yaw = yaw0 + off.yaw, pitch = clamp(pitch0 + off.pitch, -1.45, -0.04);
        look.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
        camera.position.copy(at).addScaledVector(look, -d);
        if (spot.box && mode !== "top") {
          const [x0, x1, z0, z1, y1] = spot.box, c = camera.position;
          c.set(clamp(c.x, x0, x1), clamp(c.y, 0.5, y1), clamp(c.z, z0, z1));
        }
        camera.lookAt(at);
      }
      camera.updateMatrixWorld();
    };
    const camChanged = () => {
      // from above: no roof, and the straight-up sky in the mirror would turn the ice blue
      renderer.clippingPlanes = camRef.current === "top" ? TOP_CLIP : NO_CLIP;
      mirror.visible = camRef.current !== "top";
      snap = true;
      lens();
      apply();
    };

    /* ---------- teammates outside the picture: arrows at the screen edge ---------- */
    const proj = new THREE.Vector3();
    let hudKey = "";
    const pushHud = () => {
      const out: Edge[] = [];
      let hidden = 0, partial = 0;
      if (camRef.current === "eyes") {
        // arrows stay in the band between the header and the footer
        const pad = 34, root = host.parentElement;
        const y0 = Math.min(h / 2 - 1, (root?.querySelector<HTMLElement>(".v3d-top")?.offsetHeight ?? 0) + 24);
        const y1 = Math.max(h / 2 + 1, h - (root?.querySelector<HTMLElement>(".v3d-foot")?.offsetHeight ?? 0) - 24);
        for (const m of mates) {
          if (!m.sk.root.visible) continue;
          proj.copy(m.chest).project(camera);
          const behind = proj.z > 1;
          let x = proj.x, y = proj.y;
          if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) continue;
          if (behind) { x = -x; y = -y; }
          const ang = Math.atan2(-y * h, x * w); // screen angle, y down
          const cx = w / 2, cy = h / 2, dx = Math.cos(ang), dy = Math.sin(ang);
          const t = Math.min((cx - pad) / Math.abs(dx || 1e-6), ((dy >= 0 ? y1 : y0) - cy) / (dy || 1e-6));
          out.push({ id: m.id, label: m.tag, x: Math.round(cx + dx * t), y: Math.round(cy + dy * t), angle: Math.round(ang / DEG) });
        }
        // keep labels on the same edge from piling up
        out.sort((a, b) => a.y - b.y || a.x - b.x);
        for (let i = 1; i < out.length; i++) {
          const prev = out[i - 1], e = out[i];
          if (Math.abs(prev.x - e.x) < 48 && e.y - prev.y < 48) e.y = prev.y + 48;
        }
        // ...and a pile that ran past the footer moves back up
        for (let i = out.length - 1; i >= 0; i--) {
          const e = out[i], below = out.slice(i + 1).find(o => Math.abs(o.x - e.x) < 48);
          e.y = Math.min(e.y, y1, below ? below.y - 48 : Infinity);
        }
        for (const id in sight) { if (sight[id] === "hidden") hidden++; else if (sight[id] === "partial") partial++; }
      }
      const key = `${hidden},${partial}|` + out.map(e => `${e.id}:${e.x},${e.y},${e.angle}`).join(";");
      if (key !== hudKey) { hudKey = key; setHud({ edges: out, hidden, partial }); }
    };

    /* ---------- playback: advance along the plan, step to step ---------- */
    const advance = (dt: number) => {
      const pl = playRef.current;
      if (!pl || !pl.running) return;
      if (pl.hold > 0) { pl.hold -= dt; return; }
      pl.t += dt * Math.max(0.05, live.current.speed || 1);
      const end = still || pl.t >= pl.plan.T; // reduced motion: straight to the end of the step
      const t = end ? pl.plan.T : pl.t;
      const f = frameAt(pl.plan, t);
      poseRef.current = { pos: f.pos, ball: f.ball, holder: holderAt(pl.plan, t), lift: f.lift };
      apply();
      if (!end) return;
      const next = pl.idx + 1, all = live.current.steps;
      live.current.onStep(next);
      if (pl.all && next < all.length - 1) {
        Object.assign(pl, { idx: next, t: 0, plan: planMove(all[next], all[next + 1]), hold: still ? 1.2 : 0.45 });
      } else {
        playRef.current = null;
        setPlaying(false);
      }
    };

    /* ---------- the loop ---------- */
    let raf = 0, last = performance.now(), lastHud = -1e9;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.25, (now - last) / 1000); // a long gap (hidden tab) is not a jump
      last = now;
      advance(dt);
      if (!still) {
        for (const p of players) {
          if (p.moved && p.sk.root.visible) {
            p.t += dt * 1.9;
            p.sk.update(p.t);
          }
          p.moved = false;
        }
      }
      if (!dirty) return;
      place(dt);
      if (hudDirty && now - lastHud >= 100) { hudDirty = false; lastHud = now; pushHud(); } // ≤ 10 Hz
      renderer.render(scene, camera);
      // Finish easing the broadcast camera after playback stops.
      dirty = (camRef.current === "stand" || camRef.current === "goal") &&
        Math.abs(poseRef.current.ball[0] - fx) + Math.abs(poseRef.current.ball[1] - fz) > 0.01;
    };
    // a pending hud update still has to land when nothing else moves
    const hudTimer = setInterval(() => { if (hudDirty) dirty = true; }, 120);
    setViewer(viewerRef.current);
    camChanged();
    raf = requestAnimationFrame(frame);
    sceneRef.current = { apply, camChanged, setViewer };

    /* ---------- drag: turn the head, or swing the camera ---------- */
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const el = renderer.domElement;
    el.style.touchAction = "none";
    const down = (e: PointerEvent) => {
      const o = lookRef.current;
      drag = { x: e.clientX, y: e.clientY, yaw: o.yaw, pitch: o.pitch };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const o = lookRef.current, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (camRef.current === "eyes") {
        // the gaze stays where you leave it, also while he skates
        const kk = (camera.fov * DEG) / h;
        o.yaw = drag.yaw - dx * kk;
        o.pitch = clamp(drag.pitch + dy * kk, -1.08, 0.72);
      } else {
        const kk = Math.PI / Math.max(w, h);
        o.yaw = drag.yaw + dx * kk;
        o.pitch = clamp(drag.pitch - dy * kk, -1.5, 1.5);
      }
      dirty = hudDirty = true;
    };
    const up = () => { drag = null; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    const ro = new ResizeObserver(lens);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudTimer);
      ro.disconnect();
      sceneRef.current = null;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => { (x as THREE.SpriteMaterial).map?.dispose(); x.dispose(); });
      });
      mirror.dispose();
      env.dispose?.();
      renderer.dispose();
      el.remove();
    };
  }, [pieces, envId]); // not viewer: switching perspective updates the scene in place (below)

  useEffect(() => {
    if (viewerRef.current !== viewer) sceneRef.current?.setViewer(viewer);
  }, [viewer]);

  // a new step from outside (arrows, the editor): jump there, unless we are playing into it
  useEffect(() => {
    if (playRef.current?.running) return;
    playRef.current = null;
    poseRef.current = stillPose(step);
    sceneRef.current?.apply();
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickCam = (m: CamMode) => {
    setCam(m);
    camRef.current = m;
    lookRef.current = { yaw: 0, pitch: 0 };
    sceneRef.current?.camChanged();
  };

  /** Play the current step to the next one, or the whole line from the start; resumes a paused run. */
  const begin = (all: boolean) => {
    const p = playRef.current;
    if (p && !p.running && (all ? p.all : p.idx === k)) {
      p.running = true;
      p.all = all;
      setPlaying(true);
      return;
    }
    const from = all ? 0 : k;
    if (from >= line.length - 1) return;
    playRef.current = { idx: from, t: 0, plan: planMove(line[from], line[from + 1]), all, hold: all ? 0.3 : 0, running: true };
    if (from !== k) {
      poseRef.current = stillPose(line[from]);
      sceneRef.current?.apply();
      onStep(from);
    }
    setPlaying(true);
  };
  const pause = () => {
    if (playRef.current) playRef.current.running = false;
    setPlaying(false);
  };
  const go = (i: number) => {
    playRef.current = null;
    setPlaying(false);
    onStep(i);
  };

  const eyes = cam === "eyes";
  const canStep = k < line.length - 1;

  return (
    <div className="v3d" role="dialog" aria-modal="true" aria-label={`3D-vy från ${myName}`}>
      <div className="v3d-canvas" ref={hostRef} />
      {eyes && hud.edges.map(e => (
        <div key={e.id} className="v3d-edge" style={{ left: e.x, top: e.y }}>
          <span className="v3d-arrow" style={{ transform: `rotate(${e.angle}deg)` }}>➤</span>
          <span className="v3d-edge-lbl">{e.label}</span>
        </div>
      ))}
      <header className="v3d-top">
        <div className="title">
          <span className="kicker">Steg {k + 1}/{count}{step.text ? " · " + step.text : ""}</span>
          <h1>{eyes ? "Ser som" : "Följer"} {myName}</h1>
          {onViewer && (
            <label className="v3d-who">
              <span>Byt perspektiv</span>
              <select value={viewer} onChange={e => onViewer(e.target.value)}>
                <optgroup label="Vårt lag">
                  {ours.map((p, i) => <option key={p.id} value={p.id}>{p.label ? `${p.label} · ${nameOf(p, i)}` : nameOf(p, i)}</option>)}
                </optgroup>
                {theirs.length > 0 && (
                  <optgroup label="Motståndare">
                    {theirs.map((p, i) => <option key={p.id} value={p.id}>{nameOf(p, i)}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          )}
        </div>
        <div className="v3d-side">
          <button className="btn" type="button" onClick={onClose}>Stäng</button>
          <div className="v3d-env" role="group" aria-label="Miljö">
            {ENVIRONMENTS.map(e => (
              <button key={e.id} type="button" aria-pressed={envId === e.id} title={e.name} onClick={() => pickEnv(e.id)}>{e.label}</button>
            ))}
          </div>
        </div>
      </header>
      <footer className="v3d-foot">
        <div className="v3d-env v3d-cam" role="group" aria-label="Kamera">
          {CAMS.map(c => (
            <button key={c.id} type="button" aria-pressed={cam === c.id} onClick={() => pickCam(c.id)}>{c.label}</button>
          ))}
        </div>
        <div className="v3d-play">
          <button className="btn ghost v3d-arr" type="button" onClick={() => go(k - 1)} disabled={k === 0} aria-label="Föregående steg">←</button>
          <button className="btn" type="button" onClick={() => (playing ? pause() : begin(false))} disabled={!playing && !canStep}>
            {playing ? "Paus" : "Spela steg"}
          </button>
          <button className="btn ghost" type="button" onClick={() => begin(true)} disabled={playing || line.length < 2}>Spela allt</button>
          <button className="btn ghost v3d-arr" type="button" onClick={() => go(k + 1)} disabled={k >= count - 1} aria-label="Nästa steg">→</button>
        </div>
        <p className="v3d-info">
          {CAMS.find(c => c.id === cam)!.hint}
          {eyes && hud.hidden > 0 && <> <i className="dot hidden" /> {hud.hidden} skymd{hud.hidden > 1 ? "a" : ""}</>}
          {eyes && hud.partial > 0 && <> <i className="dot partial" /> {hud.partial} delvis skymd{hud.partial > 1 ? "a" : ""}</>}
        </p>
      </footer>
    </div>
  );
}

