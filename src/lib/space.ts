/* Who gets there first? For every patch of ice, the time each player needs to
   reach it (turning costs a little: a skater facing away is slower to start).
   The side that arrives first owns the patch; the margin says how clearly. */
import type { Piece, Pos } from "./types";
import { DEFAULT_SPORT, type Sport } from "./sports";

export const CELL = 1.5;     // metres per cell
const SPEED = 7;             // m/s
const TURN = 0.45;           // extra seconds to turn fully around

function prepare(p: Pos) {
  const a = p.dir * Math.PI / 180;
  return { x: p.x, y: p.y, cos: Math.cos(a), sin: Math.sin(a) };
}

function arrival(p: ReturnType<typeof prepare>, x: number, y: number) {
  const dx = x - p.x, dy = y - p.y;
  const squared = dx * dx + dy * dy;
  const d = Number.isFinite(squared) ? Math.sqrt(squared) : Math.hypot(dx, dy);
  if (d < 0.5) return 0;
  const cos = (dx * p.cos + dy * p.sin) / d; // 1 = straight ahead
  return d / SPEED + ((1 - cos) / 2) * TURN;
}

/** Grid of margins in seconds: > 0 = we arrive first, < 0 = they do. Row-major, cols × rows. */
export function spaceControl(pieces: Piece[], pos: Record<string, Pos>, sport: Sport = DEFAULT_SPORT) {
  const cols = Math.ceil(sport.length / CELL), rows = Math.ceil(sport.width / CELL);
  const us = pieces.filter(p => p.side === "us" && pos[p.id]).map(p => prepare(pos[p.id]));
  const them = pieces.filter(p => p.side === "them" && pos[p.id]).map(p => prepare(pos[p.id]));
  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
      let a = Infinity, b = Infinity;
      for (const p of us) a = Math.min(a, arrival(p, x, y));
      for (const p of them) b = Math.min(b, arrival(p, x, y));
      grid[r * cols + c] = (isFinite(b) ? b : 9) - (isFinite(a) ? a : 9);
    }
  }
  return { cols, rows, grid };
}
