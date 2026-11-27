/* Pieces every environment shares: canvas textures, instanced beams, the ice with
   its mirror, the bandy sarg, corner flags, board rings, a painted sky and
   low-poly trees. Units are metres; x along the rink, z across it, y up. */
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { L, W } from "@/lib/rink";

export interface Env { mirror: Reflector; dispose?: () => void }

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Small seeded PRNG so layouts (trees, crowd) look the same every time. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}

export function boardTex(text: string, bg: string, fg: string) {
  return canvasTex(512, 96, g => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
    g.fillStyle = fg; g.font = "bold 54px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 256, 52);
  });
}

/** Thin beams as one instanced mesh: cheap even with a couple of thousand. */
export class Beams {
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

/** Give a geometry one flat vertex colour, moved into place, ready to merge. */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, mtx?: THREE.Matrix4) {
  if (mtx) geo.applyMatrix4(mtx);
  const c = new THREE.Color(color), n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Merge painted geometries into one (one draw call). Mixed indexed and
    non-indexed shapes (polyhedra) are all flattened to non-indexed first. */
export function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map(g => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat, false)!;
  new Set([...list, ...flat]).forEach(g => g.dispose());
  return out;
}

export const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(1, 1, 1));

/* ---------- ice: a mirror under a slightly see-through sheet ---------- */
export function addIce(scene: THREE.Scene, renderer: THREE.WebGLRenderer, x0: number, x1: number, z0: number, z1: number,
  { mirrorColor = 0x8a96a2, iceColor = 0xf2f6f9, opacity = 0.8, roughness = 0.18 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mirror = new Reflector(new THREE.PlaneGeometry(x1 - x0, z1 - z0), {
    textureWidth: Math.max(256, Math.round(size.x / 2)), textureHeight: Math.max(256, Math.round(size.y / 2)), color: mirrorColor,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  scene.add(mirror);
  const ice = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshStandardMaterial({ color: iceColor, roughness, metalness: 0, transparent: true, opacity }),
  );
  ice.rotation.x = -Math.PI / 2;
  ice.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2);
  scene.add(ice);
  return mirror;
}

/* ---------- the bandy sarg along the long sides: low orange-red tubes ---------- */
export function addSarg(scene: THREE.Scene) {
  const sarg = new THREE.MeshStandardMaterial({ color: 0xd8462b, roughness: 0.5 });
  for (const z of [-0.15, W + 0.15]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, L, 12), sarg);
    s.rotation.z = Math.PI / 2;
    s.position.set(L / 2, 0.1, z);
    scene.add(s);
  }
}

/* ---------- corner flags ---------- */
export function addCornerFlags(scene: THREE.Scene) {
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
}

/* ---------- a ring of board panels around a rectangle, text facing the ice ---------- */
export const BOARD_TEXTS: [string, string, string][] = [
  ["SURTE BK", "#0057A8", "#FFC20E"], ["BANDY", "#ffffff", "#D32F2F"], ["HEJA SURTE", "#FFC20E", "#0F1B2A"],
  ["UPPSPEL", "#0F1B2A", "#ffffff"], ["ISHALLEN", "#ffffff", "#0057A8"], ["SURTE", "#D32F2F", "#ffffff"],
];

export function addBoardRing(scene: THREE.Scene, x0: number, x1: number, z0: number, z1: number,
  { height = 1.1, texts = BOARD_TEXTS, frame, rail = true, panel = 6 }: {
    height?: number; texts?: [string, string, string][]; frame: THREE.Material; rail?: boolean; panel?: number;
  }) {
  const boards = texts.map(([t, b, f]) => new THREE.MeshStandardMaterial({ map: boardTex(t, b, f), roughness: 0.6 }));
  let n = 0;
  const side = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b), segs = Math.round(len / panel);
    const dir = b.clone().sub(a).normalize();
    for (let i = 0; i < segs; i++) {
      const p = a.clone().add(dir.clone().multiplyScalar((len * (i + 0.5)) / segs));
      const m = new THREE.Mesh(new THREE.BoxGeometry(len / segs - 0.05, height, 0.12), [frame, frame, frame, frame, boards[n++ % boards.length], boards[n % boards.length]]);
      m.position.set(p.x, height / 2, p.z);
      m.rotation.y = -Math.atan2(dir.z, dir.x);
      scene.add(m);
    }
    if (rail) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.25), frame);
      r.position.set((a.x + b.x) / 2, height + 0.04, (a.z + b.z) / 2);
      r.rotation.y = -Math.atan2(dir.z, dir.x);
      scene.add(r);
    }
  };
  side(v3(x0, 0, z0), v3(x1, 0, z0));
  side(v3(x1, 0, z1), v3(x0, 0, z1));
  side(v3(x0, 0, z1), v3(x0, 0, z0));
  side(v3(x1, 0, z0), v3(x1, 0, z1));
}

/* ---------- sky: a painted panorama with a low sun, plus matching sunlight ---------- */
/** Direction towards the sun from compass-free angles: azimuth in the x–z plane
    (0 = +x, π/2 = +z) and elevation above the horizon, both in degrees. */
export function sunDir(azimuth: number, elevation: number) {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  return v3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
}

export function addSky(scene: THREE.Scene, sun: THREE.Vector3) {
  const Wd = 2048, H = 1024;
  const tex = canvasTex(Wd, H, g => {
    // zenith to horizon: deep winter blue fading to a pale, slightly warm haze
    const sky = g.createLinearGradient(0, 0, 0, H / 2);
    sky.addColorStop(0, "#1d5fae");
    sky.addColorStop(0.55, "#4f92d6");
    sky.addColorStop(0.86, "#a9cdee");
    sky.addColorStop(1, "#e4eef5");
    g.fillStyle = sky; g.fillRect(0, 0, Wd, H / 2);
    g.fillStyle = "#e9eef2"; g.fillRect(0, H / 2, Wd, H / 2); // below the horizon (hidden by snow)
    // the sun: equirectangular position of the direction
    const u = (Math.atan2(sun.z, sun.x) / (2 * Math.PI) + 0.5) * Wd;
    const vv = (0.5 - Math.asin(sun.y) / Math.PI) * H;
    for (const dx of [-Wd, 0, Wd]) {
      const glow = g.createRadialGradient(u + dx, vv, 0, u + dx, vv, 260);
      glow.addColorStop(0, "rgba(255,250,235,0.95)");
      glow.addColorStop(0.06, "rgba(255,246,220,0.8)");
      glow.addColorStop(0.25, "rgba(255,236,200,0.28)");
      glow.addColorStop(1, "rgba(255,236,200,0)");
      g.fillStyle = glow; g.fillRect(u + dx - 260, vv - 260, 520, 520);
      g.fillStyle = "#fffdf6"; g.beginPath(); g.arc(u + dx, vv, 11, 0, Math.PI * 2); g.fill();
    }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.anisotropy = 1;
  scene.background = tex;

  const light = new THREE.DirectionalLight(0xfff0d8, 2.4);
  light.position.copy(sun).multiplyScalar(100).add(v3(L / 2, 0, W / 2));
  light.target.position.set(L / 2, 0, W / 2);
  scene.add(light, light.target);
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0xf4f7fa, 1.25));
  return () => tex.dispose();
}

/** Plain snow ground well beyond everything, just under the ice. */
export function addSnowGround(scene: THREE.Scene, size = 900) {
  const tex = canvasTex(128, 128, g => {
    g.fillStyle = "#f3f6f9"; g.fillRect(0, 0, 128, 128);
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      const s = 225 + Math.floor(r() * 30);
      g.fillStyle = `rgb(${s},${s + 6},${Math.min(255, s + 14)})`;
      g.fillRect(r() * 128, r() * 128, 2, 2);
    }
  }, [size / 6, size / 6]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(L / 2, -0.08, W / 2);
  scene.add(m);
}

/* ---------- trees: spruces and pines, two instanced meshes ---------- */
function spruceGeo() {
  const trunk = paint(new THREE.CylinderGeometry(0.18, 0.25, 2, 5), 0x4a3424, at(0, 1, 0));
  const tiers = [[2.6, 5.2, 3.2], [2.0, 4.4, 5.4], [1.3, 3.6, 7.4], [0.7, 2.6, 9.2]].map(([r, h, y], i) =>
    paint(new THREE.ConeGeometry(r, h, 7), i % 2 ? 0x2c4a32 : 0x274430, at(0, y, 0, i * 0.4)));
  // a little snow on the lowest branches' tips
  const snow = paint(new THREE.ConeGeometry(0.45, 0.9, 7), 0xf2f6fa, at(0, 10.3, 0));
  return merge([trunk, ...tiers, snow]);
}
function pineGeo() {
  const trunk = paint(new THREE.CylinderGeometry(0.16, 0.26, 10, 5), 0x9a5a34, at(0, 5, 0));
  const crown1 = paint(new THREE.DodecahedronGeometry(2.4, 0), 0x3b5530, new THREE.Matrix4().compose(v3(0, 11, 0), new THREE.Quaternion(), v3(1.2, 0.6, 1)));
  const crown2 = paint(new THREE.DodecahedronGeometry(1.8, 0), 0x435d34, new THREE.Matrix4().compose(v3(0.9, 12.3, 0.4), new THREE.Quaternion(), v3(1, 0.55, 1.1)));
  return merge([trunk, crown1, crown2]);
}

/** Trees at the given spots ([x, z, scale]); about two in three are spruces. */
export function addTrees(scene: THREE.Scene, spots: [number, number, number][], seed = 1) {
  const r = rng(seed);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const kinds = [spruceGeo(), pineGeo()];
  const groups: [number, number, number, number][][] = [[], []];
  for (const [x, z, s] of spots) groups[r() < 0.68 ? 0 : 1].push([x, z, s, r()]);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  kinds.forEach((geo, k) => {
    const list = groups[k];
    if (!list.length) { geo.dispose(); return; }
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, z, s, t], i) => {
      q.setFromAxisAngle(v3(0, 1, 0), t * Math.PI * 2);
      mtx.compose(v3(x, 0, z), q, v3(s * (0.85 + t * 0.3), s, s * (0.85 + t * 0.3)));
      m.setMatrixAt(i, mtx);
      c.setHSL(0, 0, 0.75 + t * 0.25);
      m.setColorAt(i, c);
    });
    scene.add(m);
  });
}

/** Scatter tree spots in a band outside a rectangle (inner margin to outer margin). */
export function forestBand(x0: number, x1: number, z0: number, z1: number, inner: number, outer: number, n: number, seed = 3,
  keepOut: (x: number, z: number) => boolean = () => false) {
  const r = rng(seed), out: [number, number, number][] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    const x = x0 - outer + r() * (x1 - x0 + 2 * outer), z = z0 - outer + r() * (z1 - z0 + 2 * outer);
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    const d = Math.max(dx, dz);
    if (d < inner || d > outer || keepOut(x, z)) continue;
    // denser and taller further out
    const s = 0.75 + 0.6 * ((d - inner) / (outer - inner)) * r() + r() * 0.35;
    out.push([x, z, s]);
  }
  return out;
}
