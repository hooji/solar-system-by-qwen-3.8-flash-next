/**
 * pointerGesture.ts — the ONE tap-vs-drag/multi-touch decision for picking
 * (task t_06891a0f). Pure module: no three.js, no DOM, no `PointerEvent`
 * type — unit-tested in Node via scripts/pick-input.test.mjs. main.ts feeds
 * raw pointer ids/coords in and gets back "this pointerup completed a tap"
 * (coordinates) or null, so OrbitControls drags and pinch gestures can
 * never be misread as a tap-select.
 *
 * RULES (spec §10):
 *  - A tap is a single-pointer gesture whose pointerup lands within
 *    TAP_MOVE_TOLERANCE_PX (inclusive) of its pointerdown.
 *  - If a second pointer ever joins the active gesture (pinch/zoom), the
 *    WHOLE gesture is disqualified — lifting fingers one by one must not
 *    fire a select. The disqualification resets only when all pointers are
 *    gone (up/cancel of the last one).
 *  - A pointerup without a matching pointerdown, or while another pointer
 *    is still down, is never a tap.
 *  - pointercancel removes the pointer (a canceled finger must not leave a
 *    phantom down that poisons the next gesture).
 */

/** Drag threshold (CSS px): movement above this is never a tap-select. */
export const TAP_MOVE_TOLERANCE_PX = 6;

/** A viewport point in CSS pixels. */
export interface GesturePoint {
  x: number;
  y: number;
}

/**
 * Tracks active pointer ids and decides, per pointerup, whether it completes
 * a tap. All state lives in the instance — no globals, safe to unit-test and
 * safe to recreate per component mount (one tracker per canvas lifetime).
 */
export class TapGestureTracker {
  private readonly active = new Map<number, GesturePoint>();
  /** Set once a second pointer joins; cleared when all pointers are gone. */
  private multi = false;

  constructor(private readonly tolerancePx: number = TAP_MOVE_TOLERANCE_PX) {}

  /** Record pointerdown for `id` at (x, y). A second pointer taints the gesture. */
  down(id: number, x: number, y: number): void {
    this.active.set(id, { x, y });
    if (this.active.size > 1) this.multi = true;
  }

  /** Record pointercancel for `id` (removes it; last removal resets taint). */
  cancel(id: number): void {
    this.active.delete(id);
    if (this.active.size === 0) this.multi = false;
  }

  /**
   * Record pointerup for `id` at (x, y). Returns the up point when this up
   * completes a valid tap, otherwise null (drag, pinch member, stray up).
   */
  up(id: number, x: number, y: number): GesturePoint | null {
    const start = this.active.get(id);
    this.active.delete(id);
    if (this.active.size > 0) return null; // another finger is still down
    const wasMulti = this.multi;
    this.multi = false; // gesture fully ended (up or cancel) — reset
    if (wasMulti || !start) return null;
    if (Math.hypot(x - start.x, y - start.y) > this.tolerancePx) return null;
    return { x, y };
  }

  /** Number of pointers currently down (diagnostics/tests). */
  get activeCount(): number {
    return this.active.size;
  }
}
