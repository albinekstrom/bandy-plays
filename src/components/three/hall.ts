/* An indoor bandy hall around the rink: steel trusses with light strips under a
   curved roof, corrugated walls, a wooden barrier with boards, stands on one
   long side, corner flags, and shiny ice. Units are metres; x along the rink,
   z across it (the 2D y), y up. Built from code: no photos or downloaded models. */
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { L, W, MIDY } from "@/lib/rink";

const X0 = -14, X1 = L + 14;          // hall ends
const Z0 = -13, Z1 = W + 17;          // hall sides (stands on the far side)
const WALL = 8, PEAK = 17;            // eaves and ridge height
export const roofAt = (z: number) => WALL + (PEAK - WALL) * Math.sin((Math.PI * (z - Z0)) / (Z1 - Z0));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}

/** Corrugated sheet metal: soft vertical ridges. */
const corrugated = (repeat: [number, number], base = 150) => canvasTex(64, 8, g => {
  for (let x = 0; x < 64; x++) {
    const v = base + 28 * Math.sin((x / 64) * Math.PI * 8);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(x, 0, 1, 8);
  }
}, repeat);

/** Thin beams as one instanced mesh: cheap even with a couple of thousand. */
class Beams {
  private list: [THREE.Vector3, THREE.Vector3, number][] = [];
  add(a: THREE.Vector3, b: THREE.Vector3, r = 0.06) { this.list.push([a, b, r]); }
  mesh(mat: THREE.Material) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6);
    const m = new THREE.InstancedMesh(geo, mat, this.list.length);
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), mtx = new THREE.Matrix4();
    this.list.forEach(([a, b, r], i) => {
      const d = b.clone().sub(a), len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      mtx.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
      m.setMatrixAt(i, mtx);
    });
    return m;
  }
}

function boardTex(text: string, bg: string, fg: string) {
  return canvasTex(512, 96, g => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
    g.fillStyle = fg; g.font = "bold 54px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 256, 52);
  });
}

export function buildHall(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const steel = new THREE.MeshStandardMaterial({ color: 0xb7bec6, metalness: 0.6, roughness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xd9b77e, roughness: 0.7 });

  /* ---------- ice: a faint mirror under a slightly see-through sheet ---------- */
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mirror = new Reflector(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), {
    textureWidth: Math.max(256, Math.round(size.x / 2)), textureHeight: Math.max(256, Math.round(size.y / 2)), color: 0x8a96a2,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  scene.add(mirror);
  const ice = new THREE.Mesh(
    new THREE.PlaneGeometry(X1 - X0, Z1 - Z0),
    new THREE.MeshStandardMaterial({ color: 0xf2f6f9, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.8 }),
  );
  ice.rotation.x = -Math.PI / 2;
  ice.position.set((X0 + X1) / 2, 0.002, (Z0 + Z1) / 2);
  scene.add(ice);

  /* ---------- walls ---------- */
  const wallMat = (len: number) =>
    new THREE.MeshStandardMaterial({ map: corrugated([len / 1.2, 1]), roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide });
  for (const z of [Z0, Z1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, WALL), wallMat(X1 - X0));
    w.position.set((X0 + X1) / 2, WALL / 2, z);
    scene.add(w);
  }
  // end walls follow the roof's curve
  const shape = new THREE.Shape();
  shape.moveTo(Z0, 0);
  for (let i = 0; i <= 40; i++) { const z = Z0 + ((Z1 - Z0) * i) / 40; shape.lineTo(z, roofAt(z)); }
  shape.lineTo(Z1, 0);
  for (const x of [X0, X1]) {
    const geo = new THREE.ShapeGeometry(shape);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - Z0) / 1.2, uv.getY(i) / PEAK);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: corrugated([1, 1]), roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }));
    m.rotation.y = -Math.PI / 2;
    m.position.x = x;
    scene.add(m);
  }

  /* ---------- roof sheet ---------- */
  const roofGeo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 1, 48);
  const pos = roofGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (X0 + X1) / 2, z = -pos.getY(i) + (Z0 + Z1) / 2;
    pos.setXYZ(i, x, roofAt(z) + 0.9, z);
  }
  roofGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: corrugated([1, (Z1 - Z0) / 0.6], 175), roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide })));

  /* ---------- trusses: arches across the hall, purlins along it ---------- */
  const beams = new Beams();
  const N = 30, frames: number[] = [];
  for (let x = X0 + 2; x <= X1 - 2; x += 7.5) frames.push(x);
  const zs = Array.from({ length: N + 1 }, (_, j) => Z0 + ((Z1 - Z0) * j) / N);
  for (const x of frames) {
    const top = zs.map(z => v(x, roofAt(z) + 0.6, z));
    const bot = zs.map(z => v(x, roofAt(z) - 1.0, z));
    for (let j = 0; j < N; j++) {
      beams.add(top[j], top[j + 1], 0.07);
      beams.add(bot[j], bot[j + 1], 0.07);
      beams.add(j % 2 ? top[j] : bot[j], j % 2 ? bot[j + 1] : top[j + 1], 0.04);
    }
    beams.add(v(x, 0, Z0 + 0.3), top[0], 0.16);   // columns
    beams.add(v(x, 0, Z1 - 0.3), top[N], 0.16);
  }
  for (let j = 2; j < N; j += 3) {
    for (let f = 0; f < frames.length - 1; f++) {
      const z = zs[j];
      beams.add(v(frames[f], roofAt(z) + 0.6, z), v(frames[f + 1], roofAt(z) + 0.6, z), 0.05);
      // diagonal bracing in every other bay
      if (f % 2 === 0) beams.add(v(frames[f], roofAt(z) - 1.0, z), v(frames[f + 1], roofAt(z) + 0.6, z), 0.03);
    }
  }
  scene.add(beams.mesh(steel));

  // light strips under the trusses, in rows along the hall
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lampGeo = new THREE.BoxGeometry(2.4, 0.08, 0.25);
  const lamps: THREE.Matrix4[] = [];
  for (let j = 3; j < N - 1; j += 3) {
    const z = zs[j], y = roofAt(z) - 1.1;
    for (let f = 0; f < frames.length - 1; f++) {
      for (const k of [0.3, 0.7]) lamps.push(new THREE.Matrix4().makeTranslation(frames[f] + (frames[f + 1] - frames[f]) * k, y, z));
    }
  }
  const lampMesh = new THREE.InstancedMesh(lampGeo, lamp, lamps.length);
  lamps.forEach((m, i) => lampMesh.setMatrixAt(i, m));
  scene.add(lampMesh);

  /* ---------- barrier with boards around the ice ---------- */
  const BX0 = -5, BX1 = L + 5, BZ0 = -5, BZ1 = W + 5, BH = 1.1;
  const boards = [
    ["SURTE BK", "#0057A8", "#FFC20E"], ["BANDY", "#ffffff", "#D32F2F"], ["HEJA SURTE", "#FFC20E", "#0F1B2A"],
    ["UPPSPEL", "#0F1B2A", "#ffffff"], ["ISHALLEN", "#ffffff", "#0057A8"], ["SURTE", "#D32F2F", "#ffffff"],
  ].map(([t, b, f]) => new THREE.MeshStandardMaterial({ map: boardTex(t, b, f), roughness: 0.6 }));
  let n = 0;
  const side = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b), segs = Math.round(len / 6);
    const dir = b.clone().sub(a).normalize();
    for (let i = 0; i < segs; i++) {
      const p = a.clone().add(dir.clone().multiplyScalar((len * (i + 0.5)) / segs));
      const panel = new THREE.Mesh(new THREE.BoxGeometry(len / segs - 0.05, BH, 0.12), [wood, wood, wood, wood, boards[n++ % boards.length], boards[n % boards.length]]);
      panel.position.set(p.x, BH / 2, p.z);
      panel.rotation.y = -Math.atan2(dir.z, dir.x);
      scene.add(panel);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.25), wood);
    rail.position.set((a.x + b.x) / 2, BH + 0.04, (a.z + b.z) / 2);
    rail.rotation.y = -Math.atan2(dir.z, dir.x);
    scene.add(rail);
  };
  side(v(BX0, 0, BZ0), v(BX1, 0, BZ0));
  side(v(BX1, 0, BZ1), v(BX0, 0, BZ1));
  side(v(BX0, 0, BZ1), v(BX0, 0, BZ0));
  side(v(BX1, 0, BZ0), v(BX1, 0, BZ1));

  /* ---------- wooden stands on the far long side ---------- */
  for (let r = 0; r < 7; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(L - 10, 0.45 * (r + 1) + 1.1, 1.3), wood);
    step.position.set(L / 2, (0.45 * (r + 1) + 1.1) / 2, BZ1 + 1.2 + r * 1.3);
    scene.add(step);
  }

  /* ---------- the bandy sarg along the long sides: low orange-red tubes ---------- */
  const sarg = new THREE.MeshStandardMaterial({ color: 0xd8462b, roughness: 0.5 });
  for (const z of [-0.15, W + 0.15]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, L, 12), sarg);
    s.rotation.z = Math.PI / 2;
    s.position.set(L / 2, 0.1, z);
    scene.add(s);
  }

  /* ---------- corner flags ---------- */
  const pole = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
  const flagMat = new THREE.MeshStandardMaterial({ map: canvasTex(64, 48, g => {
    g.fillStyle = "#1f3f9a"; g.fillRect(0, 0, 64, 48);
    g.fillStyle = "#FFC20E"; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 48); g.lineTo(0, 48); g.fill();
  }), side: THREE.DoubleSide });
  for (const [x, z] of [[0, 0], [L, 0], [0, W], [L, W]]) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8), pole);
    p.position.y = 0.7;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.08), red);
    const base2 = base.clone(); base2.rotation.y = Math.PI / 2;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), flagMat);
    flag.position.set(0.2, 1.25, 0);
    g.add(p, base, base2, flag);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  /* ---------- light: bright, even hall light from above ---------- */
  scene.background = new THREE.Color(0x8d969f);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4ae, 1.8));
  for (const [x, z] of [[L * 0.25, MIDY], [L * 0.75, MIDY]]) {
    const d = new THREE.DirectionalLight(0xffffff, 1.1);
    d.position.set(x, 30, z + 10);
    d.target.position.set(x, 0, z);
    scene.add(d, d.target);
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  return { mirror };
}
