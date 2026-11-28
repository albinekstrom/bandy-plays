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
   pts are waypoints from start to end, drawn as a smooth curve through
   them. Passes are always straight. ctrl is the older one-turn format. */
export interface Arrow {
  id: string;
  kind: ArrowKind;
  piece: string | null;
  pts: Pt[];
  ctrl?: Pt | null;
  /** A pass lifted over the players (lyra) instead of along the ice. */
  lob?: boolean;
}

export interface Step {
  id: string;
  text: string;
  pos: Record<string, Pos>;
  ball: Ball;
  arrows: Arrow[];
  /** When the pass leaves, as a share of the passer's own run (0 = at once, 1 = when he's done; default 1). */
  passAt?: number;
  /** Per-player task for this step ("Din uppgift"), by piece id. */
  notes?: Record<string, string>;
}

/* An alternative ending: branches off the main line at step `from`.
   steps[0] is its own copy of that step (with the arrows that differ),
   so the line reads main[0..from-1] + steps. */
export interface Variant {
  id: string;
  name: string;
  from: number;
  steps: Step[];
}

export interface PlayData {
  pieces: Piece[];
  steps: Step[];
  variants?: Variant[];
  /** Half width of the substitution zone in metres (växlingszon ±zone), default ZONE in rink.ts. */
  zone?: number;
}

export interface Play extends PlayData {
  id: string;
  name: string;
  updatedAt: string;
  /** Counts saves; a save names the revision it builds on so it can't overwrite a newer one. */
  revision?: number;
  shareToken?: string | null; // only sent to the owner
  tags?: string[]; // kept outside the editor's data so autosave can't wipe them
}

export interface PlaySummary {
  id: string;
  name: string;
  updatedAt: string;
  tags?: string[];
}
