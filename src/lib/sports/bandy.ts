/* Bandy: 105 × 65 m of ice, eleven a side. */
import type { Marking, Sport } from "./types";
import { namesOf } from "./util";

const L = 105, W = 65, MIDY = W / 2, P = Math.PI;

const positions = [
  { code: "MV", name: "Målvakt" }, { code: "L", name: "Libero" },
  { code: "VB", name: "Vänster back" }, { code: "HB", name: "Höger back" },
  { code: "VH", name: "Vänster halv" }, { code: "HH", name: "Höger halv" },
  { code: "VM", name: "Vänster mitt" }, { code: "MM", name: "Mitt mitt" }, { code: "HM", name: "Höger mitt" },
  { code: "VT", name: "Vänster topp" }, { code: "HT", name: "Höger topp" },
];

const markings: Marking[] = [
  { kind: "line", from: [L / 2, 0], to: [L / 2, W] },
  { kind: "arc", at: [L / 2, MIDY], r: 5 },
  // penalty areas (17 m) and goal areas (5 m)
  ...[17, 5].flatMap((r): Marking[] => [
    { kind: "arc", at: [0, MIDY], r, from: -P / 2, to: P / 2 },
    { kind: "arc", at: [L, MIDY], r, from: P / 2, to: 1.5 * P },
  ]),
  // corner arcs, 1 m
  { kind: "arc", at: [0, 0], r: 1, from: 0, to: P / 2, flat: true },
  { kind: "arc", at: [L, 0], r: 1, from: P / 2, to: P, flat: true },
  { kind: "arc", at: [0, W], r: 1, from: -P / 2, to: 0, flat: true },
  { kind: "arc", at: [L, W], r: 1, from: P, to: 1.5 * P, flat: true },
  // penalty spots and the centre spot
  ...[12, L / 2, L - 12].map((x): Marking => ({ kind: "dot", at: [x, MIDY], r: 0.3 })),
];

export const bandy: Sport = {
  id: "bandy",
  name: "Bandy",
  length: L,
  width: W,
  players: 11,
  positions,
  names: namesOf(positions),
  /* Starting shape: our 11 defending the left goal, theirs the right. */
  start: {
    us: [
      ["MV", 1.5, MIDY], ["L", 8, MIDY], ["VB", 14, 18], ["HB", 14, 47],
      ["VH", 24, 12], ["HH", 24, 53], ["VM", 36, 14], ["MM", 40, MIDY], ["HM", 36, 51],
      ["VT", 58, 8], ["HT", 58, 57],
    ],
    them: [
      [103.5, MIDY], [93, MIDY], [85, 13], [85, 52], [75, 18], [75, 47],
      [62, 20], [62, MIDY], [62, 45], [45, 25], [45, 40],
    ],
  },
  goal: { width: 3.5, height: 2.1, depth: 2, net: 1.5 },
  markings,
  surface: { kind: "ice", sarg: true, cornerFlags: true },
  /* The substitution zone (växlingszon) runs along the middle line, ±half metres.
     Set per play (PlayData.zone); plays without it use the default. */
  zone: {
    default: 5, min: 2, max: 15,
    label: z => `VÄXLINGSZON ±${String(z).replace(".", ",")} M`,
  },
};
