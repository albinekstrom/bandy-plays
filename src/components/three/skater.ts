/* A stylised bandy player: helmet with face cage, jersey, pants, socks, skates
   and a club, in a forward-leaning skating stance. update(t) runs a slow skating
   stride in place (legs by two-bone IK, so the skates stay on the ice).
   Local frame: x forward, y up, z to the player's right. */
import * as THREE from "three";

export interface Kit { jersey: number; sleeve: number; pants: number; socks: number; helmet: number; glove: number }
export const KIT_US: Kit = { jersey: 0xfecb00, sleeve: 0xfecb00, pants: 0x1f4fae, socks: 0xfecb00, helmet: 0x1f4fae, glove: 0x111111 };
export const KIT_THEM: Kit = { jersey: 0x1f4fae, sleeve: 0xf4f6f8, pants: 0x1f4fae, socks: 0x1f4fae, helmet: 0x1f4fae, glove: 0xf4f6f8 };

const SKIN = 0xe9c2a0, BOOT = 0x15181c, BLADE = 0xcfd6dc, SHAFT = 0xd8b27a, BLADE_STICK = 0x1f4fae;
const THIGH = 0.46, SHIN = 0.46, UPPER = 0.3, FORE = 0.28;
const mats = new Map<number, THREE.MeshStandardMaterial>();
const mat = (c: number) => {
  if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 }));
  return mats.get(c)!;
};

/** Knee/elbow for a two-bone limb from a to b, bending towards `bend`. */
function joint(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3) {
  const ab = b.clone().sub(a);
  const d = Math.min(ab.length(), l1 + l2 - 1e-3);
  const u = ab.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const perp = bend.clone().sub(u.clone().multiplyScalar(bend.dot(u))).normalize();
  return a.clone().add(u.multiplyScalar(along)).add(perp.multiplyScalar(h));
}

/** A capsule that is re-aimed between two points every frame. */
function limb(radius: number, color: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 1, 4, 10), mat(color));
  parent.add(m);
  const up = new THREE.Vector3(0, 1, 0);
  return (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a), len = d.length();
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
    m.scale.y = Math.max(0.01, len) / (1 + 2 * radius); // capsule is 1 + 2r tall unscaled
  };
}

export function buildSkater(kit: Kit, opts: { phase: number; holder: boolean }) {
  const root = new THREE.Group();

  // torso: leaning forward, built around the hips
  const LEAN = 0.62; // radians (~35°)
  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 4, 12), mat(kit.jersey));
  chest.position.y = 0.32;
  chest.scale.z = 1.15;
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.12, 4, 12), mat(kit.pants));
  belly.position.y = 0.02;
  torso.add(chest, belly);
  // head with helmet and cage, tilted back up to look ahead
  const head = new THREE.Group();
  head.position.y = 0.72;
  head.rotation.z = LEAN * 0.8;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), mat(SKIN));
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(kit.helmet));
  helmet.position.y = 0.02;
  helmet.rotation.z = -0.25;
  const cage = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 4), mat(0xe8e8e8));
    bar.position.set(0.125, -0.03, i * 0.035);
    cage.add(bar);
  }
  head.add(face, helmet, cage);
  torso.add(head);
  torso.rotation.z = -LEAN;
  root.add(torso);

  // limbs and kit pieces placed every frame
  const thighs = [limb(0.085, kit.pants, root), limb(0.085, kit.pants, root)];
  const shins = [limb(0.065, kit.socks, root), limb(0.065, kit.socks, root)];
  const uppers = [limb(0.06, kit.sleeve, root), limb(0.06, kit.sleeve, root)];
  const fores = [limb(0.05, kit.sleeve, root), limb(0.05, kit.sleeve, root)];
  const skates = [0, 1].map(() => {
    const g = new THREE.Group();
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.11), mat(BOOT));
    boot.position.set(0.03, 0.1, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.012), mat(BLADE));
    blade.position.set(0.04, 0.015, 0);
    g.add(boot, blade);
    root.add(g);
    return g;
  });
  const gloves = [0, 1].map(() => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), mat(kit.glove));
    root.add(g);
    return g;
  });
  // the club: straight shaft and a curved blade, drawn between two points
  const shaft = limb(0.018, SHAFT, root);
  const bladeCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, 0, 0.02), new THREE.Vector3(0.2, 0, 0.12));
  const stickBlade = new THREE.Mesh(new THREE.TubeGeometry(bladeCurve, 8, 0.022, 6), mat(BLADE_STICK));
  root.add(stickBlade);

  // a soft shadow on the ice
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, "rgba(0,0,0,.35)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.15, 0.01, 0);
  root.add(shadow);

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const PERIOD = 1.6;

  function update(t: number) {
    const ph = (t / PERIOD) * Math.PI * 2 + opts.phase;
    const hipY = 0.8 + 0.02 * Math.sin(ph * 2);
    const roll = 0.06 * Math.sin(ph);
    torso.position.set(0, hipY, 0);
    torso.rotation.x = roll;

    // legs: each pushes out to the side and back, then returns lifted
    for (const [i, s] of [[0, -1], [1, 1]] as const) {
      const lp = ph + (i ? Math.PI : 0);
      const push = Math.max(0, Math.sin(lp)), back = Math.max(0, -Math.sin(lp));
      const hip = v(-0.02, hipY - 0.05, s * 0.11).add(v(0, 0, roll * s * 0.3));
      const foot = v(0.1 - 0.32 * push + 0.05 * back, 0.07 + 0.09 * back, s * (0.16 + 0.28 * push));
      const knee = joint(hip, foot, THIGH, SHIN, v(1, 0.2, s * 0.15));
      thighs[i](hip, knee);
      shins[i](knee, foot.clone().add(v(0, 0.08, 0)));
      skates[i].position.set(foot.x, foot.y - 0.07, foot.z);
      skates[i].rotation.y = -s * 0.35 * push;
    }

    // club: blade on the ice ahead (at the ball for the ball carrier), swaying a little
    const sweep = opts.holder ? 0.18 * Math.sin(ph * 2) : 0.05 * Math.sin(ph);
    const heel = v(opts.holder ? 0.95 : 0.75, 0.025, 0.12 + sweep);
    const top = v(0.28, hipY + 0.28, -0.12);
    const low = top.clone().lerp(heel, 0.42);
    shaft(top.clone().add(top.clone().sub(heel).normalize().multiplyScalar(0.08)), heel);
    stickBlade.position.copy(heel);
    stickBlade.rotation.y = -0.2;

    // arms reach from the shoulders to the hands on the club
    const lean = v(Math.sin(LEAN), Math.cos(LEAN), 0);
    const shoulderC = v(0, hipY, 0).add(lean.multiplyScalar(0.55)).add(v(0, 0, roll * 0.3));
    const hands = [top, low];
    for (const [i, s] of [[0, -1], [1, 1]] as const) {
      const sh = shoulderC.clone().add(v(0, 0, s * 0.22));
      const hand = hands[i];
      const elbow = joint(sh, hand, UPPER, FORE, v(-0.3, -1, s * 0.8));
      uppers[i](sh, elbow);
      fores[i](elbow, hand);
      gloves[i].position.copy(hand);
    }
  }
  update(0);
  return { root, update };
}
