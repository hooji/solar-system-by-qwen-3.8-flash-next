/**
 * pickCoords.ts — the ONE pointer→NDC mapping for picking (task t_06891a0f).
 * Pure module: no three.js, no DOM — unit-tested in Node via
 * scripts/pick-coords.test.mjs. main.ts converts every pointer event
 * (desktop click, touch tap, any future input) through ndcFromClientPoint().
 *
 * WHY getBoundingClientRect():
 *  - The rect is expressed in CSS pixels of the LAYOUT viewport, so the
 *    mapping is independent of devicePixelRatio (dpr only changes the
 *    framebuffer resolution, never CSS geometry) and correct no matter where
 *    #viewport sits or how it moves.
 *  - On resize the browser recomputes the rect; the next pick reads it again
 *    (no cached size), so window resizes can never desynchronise picking.
 *  - On a rotated/transposed screen the rect's width/height are used as-is:
 *    screen (clientX, clientY) and the rect live in the SAME viewport frame,
 *    so the ratio stays exact without special-casing orientation.
 */

/** Rect stand-in: satisfied by DOMRect and plain test fakes. */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Normalized device coordinates: x,y ∈ [-1, 1], (+1,+1) = top-right. */
export interface Ndc {
  x: number;
  y: number;
}

/**
 * Map a pointer event's (clientX, clientY) to NDC relative to `rect`.
 * Returns null when the rect is degenerate (width or height ≤ 0 — e.g. a
 * hidden/zero-sized container): callers must treat null as "no pick",
 * never throw and never feed the raycaster an Infinity/NaN vector.
 * Points outside the canvas map linearly to |ndc| > 1, which the raycaster
 * handles fine (the ray simply misses the bodies).
 */
export function ndcFromClientPoint(
  clientX: number,
  clientY: number,
  rect: RectLike,
): Ndc | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}
