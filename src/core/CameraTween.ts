/**
 * CameraTween.ts — the camera-focus half of the ONE focus path
 * (task t_31402ac4). The selection→anchor derivation stays in
 * core/bodyIdentity.ts (selectionFor); THIS module owns two things:
 *
 *  1. cameraFocusDistance(): the focus-distance MAPPING — how far the camera
 *     sits from the selected body, keyed by body type and by the PARENT-LOCAL
 *     satellite system (the parent's rendered moon ring, NOT the whole solar
 *     system), so a moon/planet focus always frames its own system. Inputs
 *     are plain render-unit numbers built by the caller (main.ts) from
 *     ScaleManager in the DESTINATION state (system boost already applied),
 *     so camera distance and scale focus draw from the same numbers and can
 *     never disagree. Raw (pre-boost) vs effective (as-rendered) radius are
 *     kept apart in FocusInput — the camera frames the EFFECTIVE radius.
 *
 *  2. CameraTween: an ease-in-out dolly that starts from the camera's ACTUAL
 *     current position/target, keeps the view direction, and — critically —
 *     tracks a MOVING follow target: every step re-reads the body's current
 *     world position, so a body moving under the tween (sim time running)
 *     leaves the controls target and the final camera position consistent in
 *     scene coordinates. Re-targeting (re-select mid-flight) simply calls
 *     start() again from the current camera state — the old flight stops
 *     being applied, nothing stale is written. After finish, update() is
 *     inert: callbacks are not invoked and no camera state changes
 *     (dispose-safe). A non-finite follow position is SKIPPED, never
 *     applied — NaN from upstream cannot reach the camera.
 *
 * Pure module: only three's Vector3 math — no DOM, no scene graph. Unit
 * tested in Node via scripts/camera-focus.test.mjs.
 */
import { Vector3 } from "three";
import type { BodyType } from "../data/solarSystemData";

/** Tween duration in REAL seconds (frame-rate independent, spec §8/§16). */
export const CAMERA_TWEEN_SECONDS = 1.0;

/**
 * Distance from a system's centre, as a multiple of the system's visual
 * extent (moon ring / ring system / body radius). For a 55° vertical FOV
 * (main.ts) the extent exactly fills the viewport height at
 * distance ≈ extent/1.074; 2.2 keeps ~2× headroom for labels and rings.
 */
export const SYSTEM_HEADROOM_FACTOR = 2.2;

/** The Sun has no moon system: frame its disc with its own headroom. */
export const SUN_HEADROOM_FACTOR = 4.5;

/** Distance of the global (no-selection) view — initial Sun→Pluto framing. */
export const GLOBAL_VIEW_DISTANCE = 340;

/** Minimum sane camera distance (floor for degenerate/zero-extent inputs). */
export const MIN_FOCUS_DISTANCE = 3;

/**
 * Everything the distance mapping needs, already expressed in RENDER units
 * for the DESTINATION state. Built by main.ts (focusFrameFor) from
 * ScaleManager + SolarSystem AFTER scale.selectedId is applied, so the
 * §13 system boost is included exactly as the scene will render it.
 */
export interface FocusInput {
  /** Selected body type; null = global view. */
  type: BodyType | null;
  /** Render radius WITHOUT the §13 system boost (raw mapping value). */
  rawRenderRadius: number;
  /** Render radius AS RENDERED — includes the boost when applicable. */
  effectiveRenderRadius: number;
  /** True when effectiveRenderRadius includes the system boost. */
  systemBoosted: boolean;
  /**
   * Visual extent of the body's PARENT-LOCAL system in render units:
   * the farthest rendered moon ring of the system plus any ring system.
   * For a moon selection this is the PARENT's system; for a planet it is
   * its own (boosted) system; 0 when the system has neither.
   */
  systemExtent: number;
}

/** Framed visual extent of a selection (the quantity the camera pulls back to). */
export function focusExtent(input: FocusInput): number {
  return Math.max(
    positiveOr(input.systemExtent, 0),
    positiveOr(input.effectiveRenderRadius, 0),
  );
}

/**
 * The focus-distance mapping (camera and focus-anchor scale share this ONE
 * rule — selectionFor picks WHAT to focus, this decides HOW FAR):
 *  - global view (null)     : fixed distance framing Sun→Pluto (spec §9).
 *  - star (Sun selected)    : effective radius × SUN_HEADROOM_FACTOR.
 *  - planet / dwarf / moon  : max(parent-local system extent, effective
 *                             radius) × SYSTEM_HEADROOM_FACTOR.
 * Never throws, never returns NaN or a non-positive value: degenerate
 * inputs land on MIN_FOCUS_DISTANCE / GLOBAL_VIEW_DISTANCE.
 */
export function cameraFocusDistance(input: FocusInput | null): number {
  if (!input || input.type === null) return finiteOr(GLOBAL_VIEW_DISTANCE, 1);
  let dist: number;
  if (input.type === "star") {
    dist = positiveOr(input.effectiveRenderRadius, 1) * SUN_HEADROOM_FACTOR;
  } else {
    dist = focusExtent(input) * SYSTEM_HEADROOM_FACTOR;
  }
  if (!Number.isFinite(dist)) return GLOBAL_VIEW_DISTANCE;
  return Math.max(dist, MIN_FOCUS_DISTANCE);
}

function positiveOr(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Cubic ease-in-out (identical curve to SolarSystem's scale transitions). */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const FALLBACK_DIR = new Vector3(0, 0.5, 1).normalize();
const _live = new Vector3();

function isFiniteVec(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** ---------------------------------------------------------------------- **/
/** CameraTween                                                              **/
/** ---------------------------------------------------------------------- **/

export type FollowFn = (out: Vector3) => void;

/**
 * One ease-in-out camera flight at a time. Usage (main.ts, per frame):
 *   tween.start(controls.target, camera.position, dist, follow)
 *   if (tween.update(dtSec, follow, outPos, outTarget)) {
 *     camera.position.copy(outPos); controls.target.copy(outTarget);
 *   }
 *
 * Invariants (task t_31402ac4):
 *  - Start = the camera's ACTUAL current position/target — never a guess,
 *    so a re-select mid-flight continues smoothly (safe cancellation of the
 *    previous leg: start() resets progress; the old leg is never applied).
 *  - View direction is preserved; the flight dollies to `distance`.
 *  - MOVING TARGET: `follow(out)` writes the body's CURRENT world position
 *    EVERY step. The controls target blends from the captured start anchor
 *    to that live position, so at t=1 target === world position EXACTLY and
 *    the camera sits `distance` away along the preserved direction — both in
 *    scene coordinates (getWorldPosition handles parent-local moon frames,
 *    core/bodyIdentity.ts coordFrameOf).
 *  - After finished, update() is inert: follow is NOT called and no camera
 *    state changes (dispose-safe).
 *  - A non-finite follow position is SKIPPED for that step — NaN from
 *    upstream never reaches the camera or the controls target.
 */
export class CameraTween {
  private fromPos = new Vector3();
  private fromTarget = new Vector3();
  private dir = FALLBACK_DIR.clone();
  private distance = GLOBAL_VIEW_DISTANCE;
  private progress = 1;
  private readonly durationSec: number;

  constructor(durationSec: number = CAMERA_TWEEN_SECONDS) {
    this.durationSec = durationSec > 0 && Number.isFinite(durationSec)
      ? durationSec
      : CAMERA_TWEEN_SECONDS;
  }

  /** True while a flight is in progress. */
  get active(): boolean {
    return this.progress < 1;
  }

  /** Flight length in real seconds (constructor-sanitised). */
  get durationSeconds(): number {
    return this.durationSec;
  }

  /** Normalised progress 0..1 (verification/diagnostics). */
  get progressValue(): number {
    return this.progress;
  }

  /** Distance of the current/last flight (verification/diagnostics). */
  get lastDistance(): number {
    return this.distance;
  }

  get finished(): boolean {
    return this.progress >= 1;
  }

  /**
   * Begin (or re-target) a flight. `fromPosition`/`fromTarget` MUST be the
   * camera/controls' CURRENT values (capture clones, don't reuse live
   * objects — start() copies them into private state).
   */
  start(fromTarget: Vector3, fromPosition: Vector3, distance: number): void {
    if (isFiniteVec(fromTarget)) this.fromTarget.copy(fromTarget);
    if (isFiniteVec(fromPosition)) this.fromPos.copy(fromPosition);
    this.distance = positiveOr(distance, MIN_FOCUS_DISTANCE);
    this.dir.copy(this.fromPos).sub(this.fromTarget);
    if (this.dir.lengthSq() < 1e-12) this.dir.copy(FALLBACK_DIR);
    else this.dir.normalize();
    this.progress = 0;
  }

  /**
   * Advance by dtSec REAL seconds and write the new camera position/target.
   * Returns false when nothing was applied (idle/finished, dt non-finite of
   * zero, or the follow position was invalid this step).
   */
  update(dtSec: number, follow: FollowFn, outPos: Vector3, outTarget: Vector3): boolean {
    if (this.progress >= 1) return false; // inert after finish (dispose-safe)
    if (!Number.isFinite(dtSec) || dtSec <= 0) return false;
    // Seed with the CURRENT target so a broken follow keeps the last good
    // anchor instead of drifting; then re-read the live world position.
    follow(_live.copy(outTarget));
    if (!isFiniteVec(_live)) return false; // skip this step, never propagate NaN
    this.progress = Math.min(1, this.progress + Math.min(1, dtSec) / this.durationSec);
    const k = easeInOut(this.progress);
    outTarget.lerpVectors(this.fromTarget, _live, k);
    outPos.copy(_live).addScaledVector(this.dir, this.distance);
    outPos.lerpVectors(this.fromPos, outPos, k);
    if (this.progress >= 1) {
      // Exact landing: target === live world position, camera at `distance`
      // along the preserved direction — no residual blend, no jump later.
      outTarget.copy(_live);
      outPos.copy(_live).addScaledVector(this.dir, this.distance);
    }
    return true;
  }

  /** Stop the flight without touching the camera (cancel + stay put). */
  cancel(): void {
    this.progress = 1;
  }
}
