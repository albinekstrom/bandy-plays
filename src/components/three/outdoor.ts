/* A natural-ice bandy field on a sunny Swedish winter day: low sun in a clear
   sky, plowed snow banks around the ice, a belt of spruce and pine, a few
   falu-red cottages, a wooden kiosk and scoreboard, wooden light poles.
   Units are metres; x along the rink, z across it, y up. */
import * as THREE from "three";
import {
  addCornerFlags, addIce, addSarg, addSky, addSnowGround, addTrees, at, Beams, canvasTex, forestBand, merge, paint, rng, type Surface,
  sunDir, v3, type Env,
} from "./common";

const ICE = 7; // natural ice reaches this far past the lines before the snow banks

/** Points along a rounded rectangle with their outward normals and arc length. */
function roundedRect(x0: number, x1: number, z0: number, z1: number, r: number, step: number) {
  const pts: { p: THREE.Vector2; n: THREE.Vector2; s: number }[] = [];
  const corners: [number, number, number][] = [[x1 - r, z0 + r, -Math.PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI]];
  let s = 0, last: THREE.Vector2 | null = null;
  const push = (p: THREE.Vector2, n: THREE.Vector2) => { if (last) s += last.distanceTo(p); pts.push({ p, n, s }); last = p; };
  corners.forEach(([cx, cz, a0], i) => {
    // quarter arc around this corner
    for (let k = 0; k <= 6; k++) {
      const a = a0 + (k / 6) * (Math.PI / 2);
      const n = new THREE.Vector2(Math.cos(a), Math.sin(a));
      push(new THREE.Vector2(cx + n.x * r, cz + n.y * r), n);
    }
    // straight run to the next corner
    const [nx, nz] = corners[(i + 1) % 4], a1 = a0 + Math.PI / 2;
    const n = new THREE.Vector2(Math.cos(a1), Math.sin(a1));
    const from = new THREE.Vector2(cx + n.x * r, cz + n.y * r), to = new THREE.Vector2(nx + n.x * r, nz + n.y * r);
    const segs = Math.max(1, Math.round(from.distanceTo(to) / step));
    for (let k = 1; k < segs; k++) push(from.clone().lerp(to, k / segs), n.clone());
  });
  return pts;
}

/** A lumpy snow ridge swept along a closed path: one mesh. */
function snowRidge(path: ReturnType<typeof roundedRect>, halfW: number, h: number, seed: number) {
  const K = 8, N = path.length;
  const pos: number[] = [], idx: number[] = [];
  const r = rng(seed), ph = [r() * 9, r() * 9, r() * 9];
  for (const { p, n, s } of path) {
    const bump = 0.7 + 0.18 * Math.sin(s * 0.21 + ph[0]) + 0.12 * Math.sin(s * 0.57 + ph[1]) + 0.08 * Math.sin(s * 1.3 + ph[2]);
    const wide = 1 + 0.15 * Math.sin(s * 0.09 + ph[1]);
    for (let k = 0; k <= K; k++) {
      const a = (k / K) * Math.PI, off = -Math.cos(a) * halfW * wide;
      pos.push(p.x + n.x * off, Math.pow(Math.sin(a), 0.8) * h * bump - 0.05, p.y + n.y * off);
    }
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    for (let k = 0; k < K; k++) {
      const a = i * (K + 1) + k, b = j * (K + 1) + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Triangular gable prism, ridge along x, base on y = 0. */
function gable(len: number, w: number, h: number) {
  const x = len / 2, z = w / 2;
  const P = [
    [-x, 0, -z], [-x, 0, z], [-x, h, 0], // west end
    [x, 0, z], [x, 0, -z], [x, h, 0],    // east end
    [-x, 0, z], [x, 0, z], [x, h, 0], [-x, 0, z], [x, h, 0], [-x, h, 0], // south slope
    [x, 0, -z], [-x, 0, -z], [-x, h, 0], [x, 0, -z], [-x, h, 0], [x, h, 0], // north slope
  ].flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  geo.computeVertexNormals();
  return geo;
}

/** A falu-red cottage with white trim, front (door, windows) facing +z. */
export function cottageGeo() {
  const RED = 0x8a2219, WHITE = 0xf4f1ea, GLASS = 0x2a3540, ROOF = 0x2e2a28, SNOW = 0xf3f7fa;
  const Lx = 7.5, D = 5.4, H = 2.9, RH = 1.9;
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, ry = 0, rx = 0) =>
    paint(new THREE.BoxGeometry(w, h, d), c, at(x, y, z, ry, rx));
  const parts: THREE.BufferGeometry[] = [
    box(Lx, H, D, RED, 0, H / 2, 0),
    paint(gable(Lx, D, RH), RED, at(0, H, 0)),
  ];
  // white corner boards and eave boards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.2, H, 0.2, WHITE, sx * (Lx / 2), H / 2, sz * (D / 2)));
  for (const sz of [-1, 1]) parts.push(box(Lx + 0.3, 0.22, 0.12, WHITE, 0, H - 0.1, sz * (D / 2 + 0.04)));
  // roof planes with snow on top
  const slope = Math.atan2(RH, D / 2), half = Math.hypot(RH, D / 2) + 0.5;
  for (const s of [-1, 1]) {
    const cz = s * (Math.cos(slope) * half) / 2, cy = H + RH - (Math.sin(slope) * half) / 2;
    const ny = Math.cos(slope), nz = s * Math.sin(slope); // outward normal of this roof plane
    parts.push(box(Lx + 0.8, 0.14, half, ROOF, 0, cy + ny * 0.07, cz + nz * 0.07, 0, s * slope));
    parts.push(box(Lx + 0.7, 0.16, half - 0.1, SNOW, 0, cy + ny * 0.2, cz + nz * 0.2, 0, s * slope));
  }
  // windows: white frame, dark glass, white cross
  const win = (x: number, z: number, ry: number) => {
    const dz = Math.cos(ry), dx = Math.sin(ry);
    parts.push(box(1.15, 1.2, 0.08, WHITE, x + dx * 0.02, 1.6, z + dz * 0.02, ry));
    parts.push(box(0.9, 0.95, 0.08, GLASS, x + dx * 0.05, 1.6, z + dz * 0.05, ry));
    parts.push(box(0.07, 0.95, 0.08, WHITE, x + dx * 0.08, 1.6, z + dz * 0.08, ry));
    parts.push(box(0.9, 0.07, 0.08, WHITE, x + dx * 0.08, 1.6, z + dz * 0.08, ry));
  };
  win(-2.3, D / 2, 0); win(2.3, D / 2, 0); win(0, -D / 2, Math.PI); win(-2.3, -D / 2, Math.PI); win(2.3, -D / 2, Math.PI);
  win(-Lx / 2, 0, -Math.PI / 2); win(Lx / 2, 0, Math.PI / 2);
  // door with white frame, and a chimney
  parts.push(box(1.25, 2.25, 0.08, WHITE, 0, 1.12, D / 2 + 0.02));
  parts.push(box(1.0, 2.05, 0.08, 0x2f5d7c, 0, 1.03, D / 2 + 0.05));
  parts.push(box(0.6, 1.6, 0.6, 0x7b3b2a, 1.6, H + RH, -0.8));
  parts.push(box(0.7, 0.18, 0.7, SNOW, 1.6, H + RH + 0.85, -0.8));
  return merge(parts);
}

export function buildOutdoor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, surf: Surface): Env {
  const L = surf.length, W = surf.width, MIDY = W / 2;
  const sun = sunDir(62, 15);
  const disposeSky = addSky(scene, sun, surf);
  scene.fog = new THREE.Fog(0xdce8f2, 140, 560);

  /* ---------- natural ice with sun glare, snow around ---------- */
  const mirror = addIce(scene, renderer, -ICE, L + ICE, -ICE, W + ICE, {
    mirrorColor: 0x93a3b3, iceColor: 0xdfe8ef, opacity: 0.72, roughness: 0.12,
  });
  addSnowGround(scene, surf);
  if (surf.surface.sarg) addSarg(scene, surf);
  if (surf.surface.cornerFlags) addCornerFlags(scene, surf);

  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf4f8fb });
  const inner = roundedRect(-ICE - 1.7, L + ICE + 1.7, -ICE - 1.7, W + ICE + 1.7, 7, 1.5);
  scene.add(new THREE.Mesh(snowRidge(inner, 1.9, 1.3, 11), snowMat));
  const outer = roundedRect(-ICE - 5.5, L + ICE + 5.5, -ICE - 5.5, W + ICE + 5.5, 10, 2);
  scene.add(new THREE.Mesh(snowRidge(outer, 2.4, 0.7, 12), snowMat));
  // a few heaps where the plough turned
  {
    const r = rng(21), heaps = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), snowMat, 14);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    const spots: [number, number][] = [[-14, -13], [L + 14, -13], [-14, W + 13], [L + 14, W + 13], [-16, MIDY - 18], [L + 16, MIDY + 16], [30, W + 15],
      [75, W + 16], [-15, MIDY + 20], [L + 15, MIDY - 21], [48, W + 14], [92, -15], [12, -15], [62, -14.5]];
    spots.forEach(([x, z], i) => {
      const s = 1.6 + r() * 1.6;
      q.setFromAxisAngle(v3(0, 1, 0), r() * 6);
      mtx.compose(v3(x, -0.4, z), q, v3(s * 1.4, s * 0.75, s));
      heaps.setMatrixAt(i, mtx);
    });
    scene.add(heaps);
  }

  /* ---------- cottages, kiosk and scoreboard on the near side ---------- */
  const cottages: [number, number, number][] = [[6, -27, 0.15], [24, -29, -0.1], [86, -28, 0.05], [L + 30, 12, -Math.PI / 2 + 0.2], [-30, 50, Math.PI / 2]];
  {
    const geo = cottageGeo();
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), cottages.length);
    cottages.forEach(([x, z, ry], i) => m.setMatrixAt(i, at(x, 0, z, ry)));
    scene.add(m);
  }

  const kx = 52, kz = -20;
  {
    const wood = 0x7a5233, RED = 0x8a2219, WHITE = 0xf4f1ea, SNOW = 0xf3f7fa;
    const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, rx = 0) =>
      paint(new THREE.BoxGeometry(w, h, d), c, at(x, y, z, 0, rx));
    const geo = merge([
      box(4.2, 2.6, 3, RED, 0, 1.3, 0),
      box(2.6, 1.0, 0.1, 0x2a2420, 0, 1.55, 1.52),       // open hatch
      box(2.9, 0.12, 0.7, wood, 0, 1.0, 1.75),            // counter
      box(2.9, 0.08, 0.9, WHITE, 0, 2.2, 1.85, -0.5),     // hatch lid
      box(4.8, 0.2, 3.8, 0x2e2a28, 0, 2.7, 0),            // flat roof
      box(4.7, 0.2, 3.7, SNOW, 0, 2.88, 0),
      ...[-1, 1].flatMap(sx => [-1, 1].map(sz => box(0.15, 2.6, 0.15, WHITE, sx * 2.1, 1.3, sz * 1.5))),
    ]);
    const k = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    k.position.set(kx, 0, kz);
    scene.add(k);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshLambertMaterial({ map: canvasTex(256, 64, g => {
      g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#8a2219"; g.font = "bold 46px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("KIOSK · KAFFE", 128, 35);
    }) }));
    sign.position.set(kx, 3.35, kz + 1.6);
    scene.add(sign);
  }

  // scoreboard on wooden legs behind the right-hand goal, facing the ice
  {
    const tex = canvasTex(512, 200, g => {
      g.fillStyle = "#14181c"; g.fillRect(0, 0, 512, 200);
      g.fillStyle = "#f4f1ea"; g.font = "bold 40px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("HEMMA", 110, 42); g.fillText("BORTA", 402, 42);
      g.fillStyle = "#FFC20E"; g.font = "bold 96px 'Courier New', monospace";
      g.fillText("2", 110, 128); g.fillText("1", 402, 128);
      g.fillStyle = "#ff5a3c"; g.font = "bold 54px 'Courier New', monospace"; g.fillText("34:12", 256, 120);
      g.fillStyle = "#f4f1ea"; g.font = "bold 28px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.fillText("HALVLEK 1", 256, 172);
    });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6e4a2e });
    const face = new THREE.MeshBasicMaterial({ map: tex });
    const board = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.5, 0.3), [wood, wood, wood, wood, face, wood]);
    const g = new THREE.Group();
    board.position.y = 4.4;
    g.add(board);
    const beams = new Beams();
    for (const x of [-2.6, 2.6]) beams.add(v3(x, 0, -0.3), v3(x, 5.8, -0.3), 0.14);
    beams.add(v3(-3.3, 5.75, -0.2), v3(3.3, 5.75, -0.2), 0.08);
    g.add(beams.mesh(wood));
    g.position.set(L + 20, 0, MIDY + 6);
    g.rotation.y = -Math.PI / 2 + 0.12;
    scene.add(g);
  }

  /* ---------- wooden light poles along the long sides ---------- */
  {
    const poles = new Beams(), heads: THREE.Matrix4[] = [];
    for (const z of [-ICE - 9, W + ICE + 9]) for (const x of [0, 35, 70, L]) {
      poles.add(v3(x, -0.5, z), v3(x, 14, z), 0.18);
      const toward = z < 0 ? 1 : -1;
      poles.add(v3(x, 13.3, z), v3(x, 13.9, z + toward * 0.9), 0.06);
      heads.push(new THREE.Matrix4().compose(v3(x, 13.9, z + toward * 1.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(toward * 0.5, 0, 0)), v3(1, 1, 1)));
    }
    scene.add(poles.mesh(new THREE.MeshLambertMaterial({ color: 0x5b4330 })));
    const h = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.25, 0.6), new THREE.MeshLambertMaterial({ color: 0x3b4148 }), heads.length);
    heads.forEach((m, i) => h.setMatrixAt(i, m));
    scene.add(h);
  }

  /* ---------- the forest belt ---------- */
  const clear = (x: number, z: number) =>
    cottages.some(([cx, cz]) => Math.abs(x - cx) < 9 && Math.abs(z - cz) < 8) ||
    (Math.abs(x - kx) < 6 && Math.abs(z - kz) < 6) || (Math.abs(x - (L + 20)) < 5 && Math.abs(z - MIDY - 6) < 6);
  const near = forestBand(0, L, 0, W, 30, 70, 380, 5, clear);
  const far = forestBand(0, L, 0, W, 70, 170, 520, 6, clear).map(([x, z, s]) => [x, z, s * 1.25] as [number, number, number]);
  addTrees(scene, [...near, ...far], 9);

  return { mirror, dispose: disposeSky };
}
