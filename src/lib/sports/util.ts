import type { Position } from "./types";

export const namesOf = (positions: Position[]) => Object.fromEntries(positions.map(p => [p.code, p.name]));
