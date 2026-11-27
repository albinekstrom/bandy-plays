"use client";
/* Stand in a player's skates: the rink in 3D from his eye height, looking the way
   he faces in the current step. Drag to turn the head. Teammates hidden behind
   someone get a ring; teammates off-screen get an arrow at the edge. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Piece, Pos, Step } from "@/lib/types";
import { L, W, MIDY, NAMES } from "@/lib/rink";
import { ballPoint } from "@/lib/play";
import { buildHall } from "./three/hall";
import { buildSkater, KIT_THEM, KIT_US } from "./three/skater";

const EYE = 1.55; // eye height in a skating stance
const C = { line: 0xd32f2f, ball: 0xe6007e };

type Status = "clear" | "partial" | "hidden";
interface Mate { id: string; label: string; chest: THREE.Vector3 }
interface Edge { id: string; label: string; x: number; y: number; angle: number }

/* Is the line from the eye to a teammate's chest / head blocked by another body?
   Bodies are upright cylinders (r 0.3 m, from 0.2 m up to the top of the head). */
export function sightlines(pieces: Piece[], pos: Record<string, Pos>, viewer: string): Record<string, Status> {
  const me = pos[viewer], side = pieces.find(p => p.id === viewer)?.side;
  const out: Record<string, Status> = {};
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

export default function View3D({ pieces, step, viewer, k, count, onStep, onClose }: {
  pieces: Piece[];
  step: Step;
  viewer: string;
  k: number;
  count: number;
  onStep: (k: number) => void;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const sight = useMemo(() => sightlines(pieces, step.pos, viewer), [pieces, step.pos, viewer]);
  const hiddenN = Object.values(sight).filter(v => v === "hidden").length;
  const partialN = Object.values(sight).filter(v => v === "partial").length;
  const me = pieces.find(p => p.id === viewer);
  const myName = me ? (me.label ? NAMES[me.label] ?? me.label : "Motståndare") : "";

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const { mirror } = buildHall(scene, renderer);
    buildRink(scene);

    const pos = step.pos;
    const self = pos[viewer];
    const mySide = me?.side ?? "us";
    const mates: Mate[] = [];
    const skaters: ((t: number) => void)[] = [];
    pieces.forEach((pc, i) => {
      const p = pos[pc.id];
      if (!p || pc.id === viewer) return;
      const us = pc.side === "us";
      const sk = buildSkater(us ? KIT_US : KIT_THEM, { phase: (i * 2.399) % (Math.PI * 2), holder: step.ball.holder === pc.id });
      sk.root.position.set(p.x, 0, p.y);
      sk.root.rotation.y = (-p.dir * Math.PI) / 180;
      scene.add(sk.root);
      skaters.push(sk.update);
      if (pc.side === mySide) {
        const tag = pc.label || "M";
        const label = textSprite(tag, us ? "#0057A8" : "#6B7785");
        label.position.set(p.x, 2.05, p.y);
        scene.add(label);
        const chest = new THREE.Vector3(p.x, 1.15, p.y);
        mates.push({ id: pc.id, label: tag, chest });
        const st = sight[pc.id];
        if (st === "hidden" || st === "partial") {
          const r = ringSprite(st === "hidden" ? "#E6007E" : "#FFC20E", st === "hidden");
          r.position.copy(chest);
          scene.add(r);
        }
      }
    });
    const [bx, bz] = ballPoint(step.ball, pos);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: C.ball, emissive: 0x550030, roughness: 0.4 }));
    ball.position.set(bx, 0.08, bz);
    scene.add(ball);

    // labels and rings are screen overlays: keep them out of the ice reflection
    const overlays: THREE.Object3D[] = [];
    scene.traverse(o => { if ((o as THREE.Sprite).isSprite) overlays.push(o); });
    const reflect = mirror.onBeforeRender.bind(mirror);
    mirror.onBeforeRender = (...args) => {
      overlays.forEach(o => (o.visible = false));
      reflect(...args);
      overlays.forEach(o => (o.visible = true));
    };

    const eye = new THREE.Vector3(self.x, EYE, self.y);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    camera.position.copy(eye);
    let yaw = (self.dir * Math.PI) / 180, pitch = -0.12;

    const aim = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // ~95° wide where the screen allows it, never taller than 75°
      const v = Math.min(75, (2 * Math.atan(Math.tan((95 * Math.PI) / 360) / aspect) * 180) / Math.PI);
      camera.fov = v; camera.aspect = aspect; camera.updateProjectionMatrix();
      const look = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
      camera.lookAt(eye.clone().add(look));
      camera.updateMatrixWorld();
      edgesFor(w, h);
    };

    const edgesFor = (w: number, h: number) => {
      // arrows at the screen edge for teammates outside the picture
      const out: Edge[] = [];
      const pad = 34;
      for (const m of mates) {
        const v3 = m.chest.clone().project(camera);
        const behind = v3.z > 1;
        let x = v3.x, y = v3.y;
        if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) continue;
        if (behind) { x = -x; y = -y; }
        const ang = Math.atan2(-y * h, x * w); // screen angle, y down
        const cx = w / 2, cy = h / 2, dx = Math.cos(ang), dy = Math.sin(ang);
        const t = Math.min((cx - pad) / Math.abs(dx || 1e-6), (cy - pad) / Math.abs(dy || 1e-6));
        out.push({ id: m.id, label: m.label, x: cx + dx * t, y: cy + dy * t, angle: (ang * 180) / Math.PI });
      }
      // keep labels on the same edge from piling up
      out.sort((a, b) => a.y - b.y || a.x - b.x);
      for (let i = 1; i < out.length; i++) {
        const prev = out[i - 1], e = out[i];
        if (Math.abs(prev.x - e.x) < 48 && e.y - prev.y < 48) e.y = prev.y + 48;
      }
      setEdges(out);
    };

    // slow skating in place; skip the work when the page is hidden or motion is reduced
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      for (const u of skaters) u(still ? 0 : t);
      renderer.render(scene, camera);
      if (!still) raf = requestAnimationFrame(frame);
    };
    aim();
    raf = requestAnimationFrame(frame);

    // drag to turn the head; the gaze stays where you leave it
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const el = renderer.domElement;
    el.style.touchAction = "none";
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; el.setPointerCapture?.(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = (camera.fov * Math.PI) / 180 / host.clientHeight;
      yaw = drag.yaw - (e.clientX - drag.x) * k;
      pitch = Math.max(-1.2, Math.min(0.6, drag.pitch + (e.clientY - drag.y) * k));
      aim();
      if (still) renderer.render(scene, camera);
    };
    const up = () => { drag = null; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    const ro = new ResizeObserver(() => { aim(); if (still) renderer.render(scene, camera); });
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
      renderer.dispose();
      el.remove();
    };
  }, [pieces, step, viewer, me?.side, sight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="v3d" role="dialog" aria-modal="true" aria-label={`3D-vy från ${myName}`}>
      <div className="v3d-canvas" ref={hostRef} />
      {edges.map(e => (
        <div key={e.id} className="v3d-edge" style={{ left: e.x, top: e.y }}>
          <span className="v3d-arrow" style={{ transform: `rotate(${e.angle}deg)` }}>➤</span>
          <span className="v3d-edge-lbl">{e.label}</span>
        </div>
      ))}
      <header className="v3d-top">
        <div className="title">
          <span className="kicker">Steg {k + 1}/{count}{step.text ? " · " + step.text : ""}</span>
          <h1>Ser som {myName}</h1>
        </div>
        <button className="btn" type="button" onClick={onClose}>Stäng</button>
      </header>
      <footer className="v3d-foot">
        <button className="btn ghost" type="button" onClick={() => onStep(k - 1)} disabled={k === 0} aria-label="Föregående steg">←</button>
        <p className="v3d-info">
          Dra för att vrida huvudet.
          {hiddenN > 0 && <> <i className="dot hidden" /> {hiddenN} skymd{hiddenN > 1 ? "a" : ""}</>}
          {partialN > 0 && <> <i className="dot partial" /> {partialN} delvis skymd{partialN > 1 ? "a" : ""}</>}
        </p>
        <button className="btn ghost" type="button" onClick={() => onStep(k + 1)} disabled={k >= count - 1} aria-label="Nästa steg">→</button>
      </footer>
    </div>
  );
}
