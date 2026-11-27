/* Units are metres. x runs along the rink (0–105, we attack towards +x),
   y across it (0–65). Directions are degrees, 0 = facing the attack. */

export type Side = "us" | "them";
export type ArrowKind = "run" | "drib" | "pass";
export type Pt = [number, number];

export interface Piece {
  id: string;
  side: Side;
  label: string;
}

export interface Pos {
  x: number;
  y: number;
  dir: number;
}

export interface Ball {
  holder: string | null; // piece id, or null when the ball lies free
  x: number;
  y: number;
}

/* An arrow in step k describes what happens between step k and k+1.
   run/drib arrows belong to a piece; pass arrows belong to the ball.
   pts is [start, end]; ctrl, when set, bends it into one smooth turn
   (a quadratic Bézier control point). Passes are always straight. */
export interface Arrow {
  id: string;
  kind: ArrowKind;
  piece: string | null;
  pts: Pt[];
  ctrl?: Pt | null;
}

export interface Step {
  id: string;
  text: string;
  pos: Record<string, Pos>;
  ball: Ball;
  arrows: Arrow[];
}

export interface PlayData {
  pieces: Piece[];
  steps: Step[];
}

export interface Play extends PlayData {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PlaySummary {
  id: string;
  name: string;
  updatedAt: string;
}
