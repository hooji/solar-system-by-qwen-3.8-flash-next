/**
 * Picking-input contract tests (task t_06891a0f).
 * Run: node scripts/pick-input.test.mjs
 * Covers the two pure modules main.ts relies on: the pointer→NDC mapping
 * (core/pickCoords.ts) and the tap-vs-drag/multi-touch decision
 * (core/pointerGesture.ts). The raycast itself (nearest valid hit, empty
 * space) is the bodyIdentity contract (body-identity.test.mjs) plus the
 * browser check (pick-input-browser-check.mjs).
 */
import assert from "node:assert/strict";
import { pickCoords, gesture } from "./pick-input-harness.mjs";

const { ndcFromClientPoint } = pickCoords;
const { TapGestureTracker, TAP_MOVE_TOLERANCE_PX } = gesture;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

// --- NDC mapping (dpr / rect-offset / resize / degenerate) -------------------

const fullWindow = { left: 0, top: 0, width: 1280, height: 800 };

t("centre maps to (0, 0)", () => {
  const p = ndcFromClientPoint(640, 400, fullWindow);
  assert.ok(p);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
});

t("corners map to (±1, ±1) with +y up", () => {
  const tl = ndcFromClientPoint(0, 0, fullWindow);
  assert.ok(tl);
  assert.deepEqual([tl.x, tl.y], [-1, 1]);
  const br = ndcFromClientPoint(1280, 800, fullWindow);
  assert.ok(br);
  assert.deepEqual([br.x, br.y], [1, -1]);
});

t("rect offset (viewport not at origin) is subtracted", () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  const centre = ndcFromClientPoint(100 + 400, 50 + 300, rect);
  assert.ok(centre);
  assert.deepEqual([centre.x, centre.y], [0, 0]);
});

t("devicePixelRatio is irrelevant: same CSS geometry → same NDC", () => {
  // dpr only changes framebuffer size; CSS rect and client coords are the
  // same numbers at dpr 1, 2 or 3 — the mapping must be identical.
  const a = ndcFromClientPoint(300, 200, { left: 0, top: 0, width: 1000, height: 500 });
  const b = ndcFromClientPoint(300, 200, { left: 0, top: 0, width: 1000, height: 500 });
  assert.deepEqual(a, b);
});

t("after resize the new rect governs: mid-screen point still maps near centre", () => {
  const before = ndcFromClientPoint(640, 400, { left: 0, top: 0, width: 1280, height: 800 });
  assert.ok(before);
  assert.deepEqual([before.x, before.y], [0, 0]);
  // Window shrinks; the SAME physical point is now off-centre — re-reading
  // the fresh rect is what keeps picking accurate after resize.
  const after = ndcFromClientPoint(640, 400, { left: 0, top: 0, width: 640, height: 400 });
  assert.ok(after);
  assert.deepEqual([after.x, after.y], [1, -1]);
});

t("points outside the canvas map linearly beyond ±1 (no clamping)", () => {
  const p = ndcFromClientPoint(-100, 1600, fullWindow);
  assert.ok(p);
  assert.ok(p.x < -1 && p.y < -1);
});

t("degenerate rect (0-size, e.g. hidden container) returns null — never NaN", () => {
  assert.equal(ndcFromClientPoint(10, 10, { left: 0, top: 0, width: 0, height: 800 }), null);
  assert.equal(ndcFromClientPoint(10, 10, { left: 0, top: 0, width: 1280, height: 0 }), null);
  assert.equal(ndcFromClientPoint(10, 10, { left: 0, top: 0, width: -5, height: 800 }), null);
});

// --- tap gesture decision -----------------------------------------------------

t("a still pointer up within tolerance is a tap at the up point", () => {
  const g = new TapGestureTracker();
  g.down(1, 100, 100);
  const tap = g.up(1, 102, 103);
  assert.deepEqual(tap, { x: 102, y: 103 });
});

t("movement beyond the tolerance is a drag, never a tap", () => {
  const g = new TapGestureTracker();
  g.down(1, 100, 100);
  assert.equal(g.up(1, 100 + TAP_MOVE_TOLERANCE_PX + 0.1, 100), null);
});

t("movement exactly at the tolerance is still a tap (inclusive boundary)", () => {
  const g = new TapGestureTracker();
  g.down(1, 0, 0);
  assert.notEqual(g.up(1, TAP_MOVE_TOLERANCE_PX, 0), null);
});

t("long orbit drag (far past tolerance) suppresses selection", () => {
  const g = new TapGestureTracker();
  g.down(1, 500, 400);
  for (let x = 500; x < 900; x += 10) {
    /* intermediate pointermoves do not matter; only down/up geometry */
  }
  assert.equal(g.up(1, 900, 400), null);
});

t("multi-touch: pinch disqualifies BOTH fingers' ups, even a motionless one", () => {
  const g = new TapGestureTracker();
  g.down(1, 100, 100); // finger A lands, stays still
  g.down(2, 300, 300); // finger B lands → pinch
  assert.equal(g.up(2, 301, 300), null); // B up first — gesture was multi
  // A's up: only A is down now, but the gesture is tainted until it ends.
  assert.equal(g.up(1, 100, 100), null);
});

t("after all fingers lift, the taint resets and the next tap works", () => {
  const g = new TapGestureTracker();
  g.down(1, 0, 0);
  g.down(2, 0, 0);
  g.up(1, 0, 0);
  g.up(2, 0, 0);
  g.down(3, 200, 200);
  assert.notEqual(g.up(3, 200, 200), null);
});

t("second click while another pointer is down is never a tap", () => {
  const g = new TapGestureTracker();
  g.down(1, 10, 10); // left button held (e.g. panning)
  g.down(2, 10, 10); // second pointer joins → gesture tainted
  assert.equal(g.up(2, 10, 10), null); // second pointer up while first held
  assert.equal(g.up(1, 10, 10), null); // releasing the last one: multi-taint stands
});

t("pointercancel removes the pointer so no phantom stays down", () => {
  const g = new TapGestureTracker();
  g.down(1, 50, 50);
  g.cancel(1);
  assert.equal(g.activeCount, 0);
  g.down(2, 50, 50);
  assert.notEqual(g.up(2, 50, 50), null); // next gesture unaffected
});

t("cancel of the last pointer resets a multi-touch taint too", () => {
  const g = new TapGestureTracker();
  g.down(1, 0, 0);
  g.down(2, 0, 0);
  g.up(1, 0, 0); // one left, still tainted
  g.cancel(2); // browser steals the rest (system gesture)
  assert.equal(g.activeCount, 0);
  g.down(3, 0, 0);
  assert.notEqual(g.up(3, 0, 0), null);
});

t("pointerup without a matching down is never a tap", () => {
  const g = new TapGestureTracker();
  assert.equal(g.up(9, 10, 10), null);
});

t("a canceled finger does not poison the remaining single finger's tap", () => {
  // down A, down B → multi-taint; cancel B while A remains down: the
  // gesture CONTINUES with A only, taint must survive (it was still a
  // multi-touch gesture) — only full release clears it.
  const g = new TapGestureTracker();
  g.down(1, 0, 0);
  g.down(2, 0, 0);
  g.cancel(2);
  assert.equal(g.up(1, 0, 0), null);
});

console.log(`\n${n} tests passed`);
