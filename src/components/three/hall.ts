/* An indoor bandy hall around the rink: steel trusses with light strips under a
   curved roof, corrugated walls, a wooden barrier with boards, stands on one
   long side, corner flags, and shiny ice. Units are metres; x along the rink,
   z across it (the 2D y), y up. Built from code: no photos or downloaded models. */
import * as THREE from "three";
import { addBoardRing, addCornerFlags, addIce, addSarg, Beams, canvasTex, type Env, type Surface } from "./common";

const WALL = 8, PEAK = 17;            // eaves and ridge height

/** Corrugated sheet metal: soft vertical ridges. */
const corrugated = (repeat: [number, number], base = 150) => canvasTex(64, 8, g => {
  for (let x = 0; x < 64; x++) {
    const v = base + 28 * Math.sin((x / 64) * Math.PI * 8);
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(x, 0, 1, 8);
  }
}, repeat);

export function buildHall(scene: THREE.Scene, renderer: THREE.WebGLRenderer, surf: Surface): Env {
  const L = surf.length, W = surf.width, MIDY = W / 2;
  const X0 = -14, X1 = L + 14;          // hall ends
  const Z0 = -13, Z1 = W + 17;          // hall sides (stands on the far side)
  const roofAt = (z: number) => WALL + (PEAK - WALL) * Math.sin((Math.PI * (z - Z0)) / (Z1 - Z0));
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const steel = new THREE.MeshStandardMaterial({ color: 0xb7bec6, metalness: 0.6, roughness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xd9b77e, roughness: 0.7 });

  /* ---------- ice: a faint mirror under a slightly see-through sheet ---------- */
  const mirror = addIce(scene, renderer, X0, X1, Z0, Z1);

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
  addBoardRing(scene, BX0, BX1, BZ0, BZ1, { height: BH, frame: wood });

  /* ---------- wooden stands on the far long side ---------- */
  for (let r = 0; r < 7; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(L - 10, 0.45 * (r + 1) + 1.1, 1.3), wood);
    step.position.set(L / 2, (0.45 * (r + 1) + 1.1) / 2, BZ1 + 1.2 + r * 1.3);
    scene.add(step);
  }

  if (surf.surface.sarg) addSarg(scene, surf);
  if (surf.surface.cornerFlags) addCornerFlags(scene, surf);

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
