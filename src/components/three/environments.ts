/* The selectable surroundings for the 3D view, and the per-device choice. */
import type * as THREE from "three";
import type { Env } from "./common";
import { buildHall } from "./hall";
import { buildOutdoor } from "./outdoor";
import { buildArena } from "./arena";

export type EnvId = "hall" | "outdoor" | "arena";

export const ENVIRONMENTS: { id: EnvId; label: string; name: string; build: (scene: THREE.Scene, renderer: THREE.WebGLRenderer) => Env }[] = [
  { id: "hall", label: "Hall", name: "Inomhushall", build: buildHall },
  { id: "outdoor", label: "Utomhus", name: "Utomhusplan", build: buildOutdoor },
  { id: "arena", label: "Arena", name: "Arena", build: buildArena },
];

const KEY = "bandy-plays:3d-env";

export function loadEnv(): EnvId {
  try {
    const v = localStorage.getItem(KEY);
    if (ENVIRONMENTS.some(e => e.id === v)) return v as EnvId;
  } catch { /* storage unavailable: fall back to the hall */ }
  return "hall";
}

export function saveEnv(id: EnvId) {
  try { localStorage.setItem(KEY, id); } catch { /* not persisted; fine */ }
}
