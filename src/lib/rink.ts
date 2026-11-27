export const L = 105;
export const W = 65;
export const MIDY = W / 2;

export const NAMES: Record<string, string> = {
  MV: "Målvakt", L: "Libero", VB: "Vänster back", HB: "Höger back",
  VH: "Vänster halv", HH: "Höger halv", VM: "Vänster mitt", MM: "Mitt mitt", HM: "Höger mitt",
  VT: "Vänster topp", HT: "Höger topp",
};

/* Starting shape: our 11 defending the left goal, theirs the right. */
export const US_START: [string, number, number][] = [
  ["MV", 1.5, MIDY], ["L", 8, MIDY], ["VB", 14, 18], ["HB", 14, 47],
  ["VH", 24, 12], ["HH", 24, 53], ["VM", 36, 14], ["MM", 40, MIDY], ["HM", 36, 51],
  ["VT", 58, 8], ["HT", 58, 57],
];
export const THEM_START: [number, number][] = [
  [103.5, MIDY], [93, MIDY], [85, 13], [85, 52], [75, 18], [75, 47],
  [62, 20], [62, MIDY], [62, 45], [45, 25], [45, 40],
];
