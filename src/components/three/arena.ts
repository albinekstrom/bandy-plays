/* An outdoor bandy stadium on a sunny day: a covered main stand on the near long
   side, an open terrace stand on the far side, a standing terrace behind one
   goal, a scoreboard behind the other, four floodlight masts, advertising boards
   round the ice and a full, mostly yellow-and-blue crowd.
   Units are metres; x along the rink, z across it, y up. */
import * as THREE from "three";
import {
  addBoardRing, addCornerFlags, addIce, addSarg, addSky, addSnowGround, addTrees, at, Beams, canvasTex, forestBand, merge, paint, type Surface,
  rng, sunDir, v3, type Env,
} from "./common";

const B = 5;                       // boards this far outside the lines
const ROW_D = 0.85, ROW_H = 0.45;  // stand row depth and rise
const FRONT = 9;                   // stands start this far outside the lines
const SX0 = 4, SX_END = 4;         // stands run along x from SX0 to SX_END before the far end
const MAIN_ROWS = 16, OPEN_ROWS = 14;
const ROOF_Y = 12.6;

const ARENA_TEXTS: [string, string, string][] = [
  ["SURTE BK", "#0057A8", "#FFC20E"], ["BANDY", "#ffffff", "#D32F2F"], ["HEJA SURTE", "#FFC20E", "#0F1B2A"],
  ["SURTE BANDY", "#0F1B2A", "#FFC20E"], ["VINTERBANDY", "#ffffff", "#0057A8"], ["HEJA SURTE", "#0057A8", "#ffffff"],
];

const SHIRTS = [0xffc20e, 0xffc20e, 0xffc20e, 0x0057a8, 0x0057a8, 0x0057a8, 0x1d2a3a, 0xf2f2f2, 0xd32f2f, 0x6b7785, 0x2a2a2a, 0x2f6b3f, 0x7fb2e5];
const SKIN = [0xf1c7a5, 0xe8b894, 0xd9a07a, 0xb57a52, 0x8a5636];
const HATS = [0xffc20e, 0x0057a8, 0xd32f2f, 0xf2f2f2, 0x1d2a3a];

/** One step-shaped stand as a single mesh: concrete rows with a seat strip on each. */
function standGeo(L: number, rows: number, front: number, dir: 1 | -1, seat: number) {
  const SX1 = L - SX_END, len = SX1 - SX0, parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < rows; r++) {
    const top = 1.4 + r * ROW_H, z = front + dir * (r + 0.5) * ROW_D;
    parts.push(paint(new THREE.BoxGeometry(len, top, ROW_D), r % 2 ? 0xa7acb1 : 0x9ea3a8, at(L / 2, top / 2, z)));
    parts.push(paint(new THREE.BoxGeometry(len, 0.12, 0.42), seat, at(L / 2, top + 0.06, z + dir * 0.12)));
  }
  // front wall facing the ice, and end walls following the steps
  parts.push(paint(new THREE.BoxGeometry(len, 1.45, 0.2), 0xe8ecef, at(L / 2, 0.72, front)));
  const back = front + dir * rows * ROW_D;
  const zx = -dir; // extrusion (wall thickness) runs along x; keep the basis right-handed
  for (const lo of [SX0 - 0.3, SX1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let r = 0; r < rows; r++) { shape.lineTo(r * ROW_D, 1.4 + r * ROW_H + 0.4); shape.lineTo((r + 1) * ROW_D, 1.4 + r * ROW_H + 0.4); }
    shape.lineTo(rows * ROW_D, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    // shape x runs back from the front edge, shape y is up
    const m = new THREE.Matrix4().makeBasis(v3(0, 0, dir), v3(0, 1, 0), v3(zx, 0, 0));
    m.setPosition(zx > 0 ? lo : lo + 0.3, 0, front);
    parts.push(paint(g, 0xd8dde1, m));
  }
  return { geo: merge(parts), back };
}

export function buildArena(scene: THREE.Scene, renderer: THREE.WebGLRenderer, surf: Surface): Env {
  const L = surf.length, W = surf.width, MIDY = W / 2, SX1 = L - SX_END;
  const sun = sunDir(72, 19);
  const disposeSky = addSky(scene, sun, surf);
  scene.fog = new THREE.Fog(0xdce8f2, 160, 600);

  /* ---------- ice, sarg, flags, boards ---------- */
  const mirror = addIce(scene, renderer, -B, L + B, -B, W + B, { mirrorColor: 0x8f9daa, iceColor: 0xe9f0f5, opacity: 0.76, roughness: 0.14 });
  if (surf.surface.sarg) addSarg(scene, surf);
  if (surf.surface.cornerFlags) addCornerFlags(scene, surf);
  const frame = new THREE.MeshStandardMaterial({ color: 0xeef1f3, roughness: 0.5 });
  addBoardRing(scene, -B, L + B, -B, W + B, { height: 0.9, texts: ARENA_TEXTS, frame, rail: false, panel: 5 });

  addSnowGround(scene, surf);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 2 * B + 30, W + 2 * FRONT + 6), new THREE.MeshLambertMaterial({ color: 0x8f969c }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(L / 2, -0.03, MIDY);
  scene.add(apron);

  /* ---------- stands ---------- */
  const standMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const main = standGeo(L, MAIN_ROWS, -FRONT, -1, 0x0057a8);
  const open = standGeo(L, OPEN_ROWS, W + FRONT, 1, 0xffc20e);
  scene.add(new THREE.Mesh(main.geo, standMat), new THREE.Mesh(open.geo, standMat));

  // main stand: back wall, cantilevered roof with a fascia, masts and stays
  const steel = new THREE.MeshStandardMaterial({ color: 0xc3c9cf, metalness: 0.5, roughness: 0.45 });
  {
    const len = SX1 - SX0 + 2, zb = main.back - 0.3, zf = -FRONT + 1.6, depth = zb - zf;
    const shell = merge([
      paint(new THREE.BoxGeometry(SX1 - SX0, ROOF_Y, 0.3), 0x5f666e, at(L / 2, ROOF_Y / 2, zb)),
      paint(new THREE.BoxGeometry(len, 0.35, Math.abs(depth)), 0xdfe3e6, at(L / 2, ROOF_Y + 0.2, (zb + zf) / 2, 0, 0.03)),
    ]);
    scene.add(new THREE.Mesh(shell, standMat));
    const fasciaTex = canvasTex(512, 64, g => {
      g.fillStyle = "#0057A8"; g.fillRect(0, 0, 512, 64);
      g.fillStyle = "#FFC20E"; g.font = "bold 44px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("SURTE BK · BANDY", 256, 35);
    }, [6, 1]);
    const blue = new THREE.MeshLambertMaterial({ color: 0x0057a8 });
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(len, 1.3, 0.3), [blue, blue, blue, blue, new THREE.MeshLambertMaterial({ map: fasciaTex }), blue]);
    fascia.position.set(L / 2, ROOF_Y + 0.05, zf);
    scene.add(fascia);
    const beams = new Beams();
    for (let x = SX0 + 2; x <= SX1 - 1.9; x += (SX1 - SX0 - 4) / 7) {
      beams.add(v3(x, 0, zb - 0.4), v3(x, ROOF_Y + 5, zb - 0.4), 0.22);
      beams.add(v3(x, ROOF_Y + 5, zb - 0.4), v3(x, ROOF_Y + 0.4, zf + 0.5), 0.07);
      beams.add(v3(x, ROOF_Y + 5, zb - 0.4), v3(x, ROOF_Y + 0.4, (zb + zf) / 2), 0.06);
    }
    beams.add(v3(SX0 + 2, ROOF_Y + 5, zb - 0.4), v3(SX1 - 2, ROOF_Y + 5, zb - 0.4), 0.09);
    // railing on top of the open stand
    for (let x = SX0; x <= SX1 + 0.1; x += (SX1 - SX0) / 20) beams.add(v3(x, 1.4 + (OPEN_ROWS - 1) * ROW_H, open.back - 0.1), v3(x, 2.5 + (OPEN_ROWS - 1) * ROW_H, open.back - 0.1), 0.03);
    beams.add(v3(SX0, 2.5 + (OPEN_ROWS - 1) * ROW_H, open.back - 0.1), v3(SX1, 2.5 + (OPEN_ROWS - 1) * ROW_H, open.back - 0.1), 0.05);
    scene.add(beams.mesh(steel));
  }

  // standing terrace behind the left goal
  const TX = -FRONT - 1, T_STEPS = 6, T_D = 1.1, T_H = 0.32, TZ0 = 10, TZ1 = W - 10;
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let s = 0; s < T_STEPS; s++) {
      const top = 0.5 + s * T_H;
      parts.push(paint(new THREE.BoxGeometry(T_D, top, TZ1 - TZ0), s % 2 ? 0xa7acb1 : 0x9ea3a8, at(TX - (s + 0.5) * T_D, top / 2, MIDY)));
    }
    scene.add(new THREE.Mesh(merge(parts), standMat));
  }

  /* ---------- the crowd: one instanced mesh of bodies, one of heads ---------- */
  {
    type Fan = [number, number, number, boolean]; // x, seat/step height, z, standing
    const fans: Fan[] = [];
    const r = rng(42);
    const rowFans = (rows: number, front: number, dir: 1 | -1, fill: number) => {
      for (let row = 0; row < rows; row++) {
        const y = 1.4 + row * ROW_H, z = front + dir * (row * ROW_D + 0.5);
        for (let x = SX0 + 0.5; x < SX1 - 0.4; x += 0.6) {
          const edge = Math.min(x - SX0, SX1 - x) / 20; // a bit thinner at the far ends
          if (r() < fill * Math.min(1, 0.55 + edge)) fans.push([x + (r() - 0.5) * 0.12, y, z + (r() - 0.5) * 0.08, false]);
        }
      }
    };
    rowFans(MAIN_ROWS, -FRONT, -1, 0.9);
    rowFans(OPEN_ROWS, W + FRONT, 1, 0.82);
    for (let s = 0; s < T_STEPS; s++) {
      for (let z = TZ0 + 0.5; z < TZ1 - 0.4; z += 0.65) {
        if (r() < 0.55) fans.push([TX - (s + 0.5) * T_D + (r() - 0.5) * 0.5, 0.5 + s * T_H, z + (r() - 0.5) * 0.3, true]);
      }
    }
    const bodyGeo = new THREE.CylinderGeometry(0.17, 0.23, 0.62, 6);
    const headGeo = new THREE.IcosahedronGeometry(0.12, 0);
    const lam = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const bodies = new THREE.InstancedMesh(bodyGeo, lam, fans.length);
    const heads = new THREE.InstancedMesh(headGeo, lam, fans.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    fans.forEach(([x, y, z, standing], i) => {
      const tall = standing ? 1.55 : 1, sz = 0.9 + r() * 0.25;
      q.setFromAxisAngle(v3(0, 1, 0), r() * 6.28);
      mtx.compose(v3(x, y + 0.04 + 0.31 * tall * sz, z), q, v3(sz, tall * sz, sz));
      bodies.setMatrixAt(i, mtx);
      bodies.setColorAt(i, c.setHex(SHIRTS[Math.floor(r() * SHIRTS.length)]));
      mtx.compose(v3(x, y + 0.04 + 0.62 * tall * sz + 0.14, z), q, v3(sz, sz, sz));
      heads.setMatrixAt(i, mtx);
      heads.setColorAt(i, c.setHex(r() < 0.3 ? HATS[Math.floor(r() * HATS.length)] : SKIN[Math.floor(r() * SKIN.length)]));
    });
    scene.add(bodies, heads);
  }

  /* ---------- scoreboard behind the right goal ---------- */
  {
    const tex = canvasTex(768, 288, g => {
      g.fillStyle = "#0b0f14"; g.fillRect(0, 0, 768, 288);
      g.fillStyle = "#0057A8"; g.fillRect(0, 0, 768, 56);
      g.fillStyle = "#FFC20E"; g.font = "bold 44px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("SURTE BK  ·  BANDY", 384, 30);
      g.fillStyle = "#f4f1ea"; g.font = "bold 48px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      g.fillText("SURTE", 150, 110); g.fillText("GÄSTERNA", 618, 110);
      g.fillStyle = "#FFC20E"; g.font = "bold 120px 'Courier New', monospace";
      g.fillText("3", 150, 210); g.fillText("2", 618, 210);
      g.fillStyle = "#ff5a3c"; g.font = "bold 72px 'Courier New', monospace"; g.fillText("71:05", 384, 190);
      g.fillStyle = "#f4f1ea"; g.font = "bold 32px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.fillText("HALVLEK 2", 384, 256);
    });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b3036 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(12, 4.5, 0.5), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map: tex }), dark]);
    board.position.y = 7.5;
    const g = new THREE.Group();
    const legs = new Beams();
    for (const x of [-4, 4]) legs.add(v3(x, 0, -0.5), v3(x, 9.6, -0.5), 0.25);
    g.add(board, legs.mesh(steel));
    g.position.set(L + FRONT + 7, 0, MIDY);
    g.rotation.y = -Math.PI / 2;
    scene.add(g);
  }

  /* ---------- floodlight masts in the corners ---------- */
  {
    const lattice = new Beams(), H = 34;
    const lampTex = canvasTex(192, 128, g => {
      g.fillStyle = "#3a4048"; g.fillRect(0, 0, 192, 128);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        const x = 18 + i * 31, y = 18 + j * 31;
        const glow = g.createRadialGradient(x, y, 0, x, y, 14);
        glow.addColorStop(0, "#ffffff"); glow.addColorStop(0.6, "#f4f7ff"); glow.addColorStop(1, "#9aa3ad");
        g.fillStyle = glow; g.fillRect(x - 13, y - 13, 26, 26);
      }
    });
    const grey = new THREE.MeshLambertMaterial({ color: 0x5d646c });
    const lampFace = new THREE.MeshBasicMaterial({ map: lampTex });
    for (const [x, z] of [[-14, -16], [L + 14, -16], [-14, W + 16], [L + 14, W + 16]]) {
      const legs = [0, 1, 2].map(k => (y: number) => {
        const a = (k * Math.PI * 2) / 3, s = 1.3 - (0.9 * y) / H;
        return v3(x + Math.cos(a) * s, y, z + Math.sin(a) * s);
      });
      for (let y = 0; y < H; y += 2.5) {
        const y1 = Math.min(H, y + 2.5);
        for (let k = 0; k < 3; k++) {
          lattice.add(legs[k](y), legs[k](y1), 0.07);
          lattice.add(legs[k](y), legs[(k + 1) % 3](y1), 0.03);
        }
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.4), [grey, grey, grey, grey, lampFace, grey]);
      head.position.set(x, H + 1.6, z);
      head.lookAt(L / 2, 0, MIDY);
      scene.add(head);
    }
    scene.add(lattice.mesh(steel));
  }

  /* ---------- trees beyond the stadium ---------- */
  addTrees(scene, forestBand(0, L, 0, W, 48, 170, 480, 8), 13);

  return { mirror, dispose: disposeSky };
}
