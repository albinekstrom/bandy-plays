/* A sport as configuration: the surface, its markings, the players and where they
   start. Everything that used to be a bandy constant lives in one of these; the board,
   the motion logic, the video export and the 3D view read the play's sport.
   Units are metres: x 0–length along the surface (we attack towards +x), y 0–width
   across it; angles in radians, 0 = +x, growing towards +y (clockwise on screen). */
import type { Pt } from "../types";

export interface Position {
  /** Short code stored as the piece's label, e.g. "MV". */
  code: string;
  /** Swedish name shown in the UI, e.g. "Målvakt". */
  name: string;
}

/** One painted marking, drawn the same way on the 2D board, in the video and in 3D. */
export type Marking =
  | { kind: "line"; from: Pt; to: Pt }
  /** A circle, or an arc from `from` to `to` (radians, from < to). `flat: true` keeps it
      off the 3D view (too fine to paint there). */
  | { kind: "arc"; at: Pt; r: number; from?: number; to?: number; flat?: boolean }
  | { kind: "dot"; at: Pt; r: number };

/** A band along the middle line where players change (bandy's växlingszon). */
export interface SubZone {
  /** Half width in metres when the play doesn't set its own. */
  default: number;
  min: number;
  max: number;
  label: (half: number) => string;
}

export interface Sport {
  id: string;
  /** Swedish name, e.g. "Bandy". */
  name: string;
  length: number;
  width: number;
  /** Players per side on the surface, keeper included. */
  players: number;
  positions: Position[];
  /** Position code → Swedish name. */
  names: Record<string, string>;
  /** Starting shape: ours defending the left goal (code, x, y), theirs the right (x, y). */
  start: { us: [string, number, number][]; them: Pt[] };
  /** Goal mouth across the end line; `depth` is the 2D box behind it, `net` the 3D net. */
  goal: { width: number; height: number; depth: number; net: number };
  /** Markings besides the outline (the outline is always the surface's edge). */
  markings: Marking[];
  /** The 3D surface: ice, and bandy's low sarg along the long sides and corner flags. */
  surface: { kind: "ice"; sarg: boolean; cornerFlags: boolean };
  /** Optional sport-specific features. */
  zone?: SubZone;
}
