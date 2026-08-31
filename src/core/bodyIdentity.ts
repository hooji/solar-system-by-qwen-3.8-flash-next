/**
 * bodyIdentity.ts — the SINGLE celestial-body identification and selection
 * state contract (task t_766b495f). Downstream tasks (raycaster selection
 * t_06891a0f, camera focus t_31402ac4, labels/info panel t_d9203468) must
 * consume these helpers instead of re-deriving rules, so the three layers
 * can never disagree. Pure module: no three.js, no DOM — unit-tested in
 * Node via scripts/body-identity.test.mjs.
 *
 * IDENTIFICATION (stable across the app):
 *  - Canonical id: `CelestialBodyData.id` (e.g. "jupiter", "io"); parent is
 *    `CelestialBodyData.parentId` (moon → planet/dwarf). Never re-derive an
 *    id from names or scene-graph position.
 *  - Scene nodes carry the id in `userData.bodyId` on the body MESH (see
 *    CelestialBody) and on ring meshes (see SolarSystem.makeRing). Labels use
 *    the same key (Labels.attach). Group/mesh `name`s are decorative
 *    ("tilt:<id>", "ring:<id>", …) — never parse names for identity.
 *
 * PICK RESOLUTION RULE (mesh child → real body root):
 *  Raycast hits any descendant (body mesh, ring mesh, future geometry). Walk
 *  the PARENT CHAIN with resolveBodyIdFromObject(): the first node whose
 *  `userData.bodyId` names a body that EXISTS IN THE DATASET wins. Unknown
 *  ids and missing userData keep the walk going; nothing found → null
 *  (empty space, which callers must treat as "no selection", never throw).
 *
 * PARENT-LOCAL COORDINATES (moons):
 *  A moon's `group.position` lives in its PARENT GROUP's local frame (the
 *  whole moon system travels with the planet, spec §5). `coordFrameOf()`
 *  states this per body. To compare a moon against camera/scene/render
 *  coordinates ALWAYS use `group.getWorldPosition()`, never `group.position`.
 */
import { getBodyById, type CelestialBodyData } from "../data/solarSystemData";

/** userData key under which scene nodes advertise their owning body id. */
export const BODY_ID_USERDATA_KEY = "bodyId";

/**
 * Structural stand-in for a scene node: satisfied by THREE.Object3D and by
 * plain test fakes, which keeps this module three-free and Node-testable.
 */
export interface PickableNode {
  userData?: Record<string, unknown>;
  parent?: PickableNode | null;
}

/**
 * Resolve the clicked/attached scene node to its REAL body root id by
 * walking up the parent chain (ring mesh → planet group, mesh → group, …).
 * Returns null for empty space or ids not present in the dataset.
 */
export function resolveBodyIdFromObject(
  node: PickableNode | null | undefined,
): string | null {
  for (let cur = node; cur; cur = cur.parent ?? null) {
    const raw = cur.userData?.[BODY_ID_USERDATA_KEY];
    if (typeof raw === "string" && getBodyById(raw)) return raw;
  }
  return null;
}

/**
 * Planet whose SYSTEM is revealed/boosted when this body is selected
 * (spec §13 detail view): moon → its parent, planet/dwarf → itself,
 * star → none (global view rules).
 */
export function systemParentOf(data: CelestialBodyData): string | null {
  if (data.type === "moon") return data.parentId ?? null;
  if (data.type === "star") return null;
  return data.id;
}

/**
 * Heliocentric anchor for the focus distance mode when this body is
 * selected: moon → its parent (the whole system centres), star → null
 * (Sun-centred fallback), planet/dwarf → itself. Feeds
 * `ScaleManager.focusAnchorId` — the ONE rule for moon-parent mapping
 * shared by camera focus and scale focus.
 */
export function focusAnchorOf(data: CelestialBodyData): string | null {
  if (data.type === "star") return null;
  if (data.type === "moon") return data.parentId ?? data.id;
  return data.id;
}

/**
 * The complete, derived selection state. `null` (or an unknown id) means the
 * global view: no selection, no system reveal, Sun-centred focus.
 */
export interface SelectionState {
  /** Clicked body ("jupiter", "io") or null = global view. */
  selectedId: string | null;
  /** Planet whose moon system is revealed/boosted (spec §13). */
  systemParentId: string | null;
  /** Anchor fed to ScaleManager for focus distance mode. */
  focusAnchorId: string | null;
}

/** Derive the full selection state from a (possibly null/unknown) id. */
export function selectionFor(id: string | null | undefined): SelectionState {
  const data = id ? getBodyById(id) : undefined;
  if (!data) {
    return { selectedId: null, systemParentId: null, focusAnchorId: null };
  }
  return {
    selectedId: data.id,
    systemParentId: systemParentOf(data),
    focusAnchorId: focusAnchorOf(data),
  };
}

/**
 * Which frame a body's `group.position` is expressed in:
 *  - "scene":        render-unit scene coordinates (star/planet/dwarf).
 *  - "parent-local": inside the parent's Group (every moon) — see the header
 *                    note: use group.getWorldPosition() for scene math.
 */
export type CoordFrame = "scene" | "parent-local";

export function coordFrameOf(data: CelestialBodyData): CoordFrame {
  return data.type === "moon" ? "parent-local" : "scene";
}
