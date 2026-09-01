/**
 * CameraTween contract tests (task t_31402ac4).
 * Run: node scripts/camera-focus.test.mjs
 * Covers the focus-distance mapping (parent-local satellite-system framing,
 * star/global rules, NaN/degenerate floors) and the tween invariants:
 * start-from-live-state, ease-in-out endpoints, MOVING follow target,
 * mid-flight re-target safety, inert-after-finish (dispose safety),
 * and NaN skipping.
 */
import assert from "node:assert/strict";
import { camera, Vector3 } from "./camera-focus-harness.mjs";

const {
  CameraTween,
  cameraFocusDistance,
  GLOBAL_VIEW_DISTANCE,
  MIN_FOCUS_DISTANCE,
  SYSTEM_HEADROOM_FACTOR,
  CAMERA_TWEEN_SECONDS,
  easeInOut,
} = camera;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

const moonFrame = {
  type: "moon",
  rawRenderRadius: 0.5,
  effectiveRenderRadius: 0.5,
  systemBoosted: false,
  systemExtent: 10, // parent-local moon ring, render units
};
const planetFrame = {
  type: "planet",
  rawRenderRadius: 2.0,
  effectiveRenderRadius: 2.7, // §13 boost applied
  systemBoosted: true,
  systemExtent: 20,
};

// --- focus-distance mapping --------------------------------------------------

t("null selection → fixed global framing distance", () => {
  assert.equal(cameraFocusDistance(null), GLOBAL_VIEW_DISTANCE);
  assert.equal(
    cameraFocusDistance({ type: null, rawRenderRadius: 0, effectiveRenderRadius: 0, systemBoosted: false, systemExtent: 0 }),
    GLOBAL_VIEW_DISTANCE,
  );
});

t("star (Sun) selection frames the COMPLETE solar system — spec §9", () => {
  const d = cameraFocusDistance({ type: "star", rawRenderRadius: 8, effectiveRenderRadius: 8, systemBoosted: false, systemExtent: 0 });
  assert.equal(d, GLOBAL_VIEW_DISTANCE);
});

t("moon frames its PARENT-LOCAL system extent, not its own dot", () => {
  const d = cameraFocusDistance(moonFrame);
  assert.equal(d, 10 * SYSTEM_HEADROOM_FACTOR);
  assert.ok(d > moonFrame.effectiveRenderRadius * SYSTEM_HEADROOM_FACTOR);
});

t("planet frames max(system extent, effective radius) — boosted radius used", () => {
  assert.equal(cameraFocusDistance(planetFrame), 20 * SYSTEM_HEADROOM_FACTOR);
  const noMoons = { ...planetFrame, systemExtent: 0 };
  assert.equal(cameraFocusDistance(noMoons), 2.7 * SYSTEM_HEADROOM_FACTOR);
});

t("degenerate / NaN inputs never produce NaN or non-positive distances", () => {
  const bad = { type: "planet", rawRenderRadius: NaN, effectiveRenderRadius: NaN, systemBoosted: false, systemExtent: NaN };
  const d = cameraFocusDistance(bad);
  assert.ok(Number.isFinite(d) && d >= MIN_FOCUS_DISTANCE);
  const starBad = { ...bad, type: "star" };
  assert.ok(Number.isFinite(cameraFocusDistance(starBad)));
});

// --- tween math ---------------------------------------------------------------

t("ease-in-out is smooth at both ends and hits 0/1", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.ok(easeInOut(0.001) < 1e-6); // starts gently
  assert.ok(1 - easeInOut(0.999) < 1e-6); // lands gently
  assert.equal(easeInOut(0.5), 0.5);
});

function drive(tw, dt, follow, pos, target, steps) {
  for (let i = 0; i < steps; i++) tw.update(dt, follow, pos, target);
}

t("static target: lands EXACTLY at target with camera at requested distance", () => {
  const tw = new CameraTween();
  const target = new Vector3(5, 0, -3);
  const pos = new Vector3();
  const tgt = new Vector3(0, 0, 0);
  tw.start(tgt.clone(), new Vector3(0, 0, 50), 12);
  const follow = (out) => out.copy(target);
  drive(tw, 1 / 60, follow, pos, tgt, 120); // 2 s > 1 s duration
  assert.ok(tw.finished);
  assert.ok(tgt.distanceTo(target) < 1e-9);
  assert.ok(Math.abs(pos.distanceTo(target) - 12) < 1e-9);
  // direction from target preserved (start was +Z from origin)
  assert.ok(pos.clone().sub(target).normalize().distanceTo(new Vector3(0, 0, 1)) < 1e-9);
});

t("MOVING target: the step where the tween finishes lands on CURRENT world pos", () => {
  const tw = new CameraTween();
  const pos = new Vector3();
  const tgt = new Vector3();
  tw.start(tgt.clone(), new Vector3(0, 10, 60), 15);
  // Body slides along X while the tween runs (sim time moving under the flight).
  const body = new Vector3(0, 0, 0);
  let landed = null;
  for (let i = 0; i < 90; i++) {
    body.x += 0.25; // continuous motion, well beyond the tween window
    tw.update(1 / 60, (out) => out.copy(body), pos, tgt);
    if (tw.finished && !landed) landed = { body: body.clone(), tgt: tgt.clone(), pos: pos.clone() };
  }
  // At the exact finishing step, target === live world position and the
  // camera sits at the requested distance from it (scene coordinates).
  assert.ok(landed, "tween never finished");
  assert.ok(Math.abs(landed.tgt.x - landed.body.x) < 1e-9 && landed.tgt.y === 0 && landed.tgt.z === 0);
  assert.ok(Math.abs(landed.pos.distanceTo(landed.body) - 15) < 1e-9);
  // After finishing the tween is inert — later motion does not yank the camera.
  assert.ok(Math.abs(tgt.x - landed.tgt.x) < 1e-12);
});

t("mid-flight re-target: old leg stops, new leg starts from live camera state", () => {
  const tw = new CameraTween();
  const pos = new Vector3(0, 0, 50);
  const tgt = new Vector3(0, 0, 0);
  tw.start(tgt.clone(), pos.clone(), 12);
  const a = new Vector3(30, 0, 0);
  const b = new Vector3(-40, 5, 0);
  drive(tw, 1 / 60, (o) => o.copy(a), pos, tgt, 20); // mid-flight
  const livePos = pos.clone();
  const liveTgt = tgt.clone();
  tw.start(liveTgt.clone(), livePos.clone(), 10); // cancel + re-aim at b
  drive(tw, 1 / 60, (o) => o.copy(b), pos, tgt, 120);
  assert.ok(tgt.distanceTo(b) < 1e-9);
  assert.ok(Math.abs(pos.distanceTo(b) - 10) < 1e-9);
  // No jump: the new leg began exactly where the old one left the camera.
  assert.ok(pos.distanceTo(livePos) > 0 || livePos.distanceTo(b) < 10 + 1e-9);
});

t("inert after finish: update() applies nothing and never calls follow (dispose-safe)", () => {
  const tw = new CameraTween();
  const pos = new Vector3();
  const tgt = new Vector3();
  tw.start(tgt.clone(), new Vector3(0, 0, 40), 10);
  const dest = new Vector3(7, 0, 7);
  drive(tw, 1 / 60, (o) => o.copy(dest), pos, tgt, 90);
  const posAfter = pos.clone();
  const tgtAfter = tgt.clone();
  let calls = 0;
  const still = tw.update(1 / 60, (o) => { calls++; o.set(999, 999, 999); }, pos, tgt);
  assert.equal(still, false);
  assert.equal(calls, 0);
  assert.ok(pos.equals(posAfter) && tgt.equals(tgtAfter));
});

t("NaN follow position is SKIPPED — camera/target stay finite", () => {
  const tw = new CameraTween();
  const pos = new Vector3();
  const tgt = new Vector3();
  tw.start(tgt.clone(), new Vector3(0, 0, 30), 10);
  const good = new Vector3(1, 2, 3);
  let flip = true;
  for (let i = 0; i < 30; i++) {
    flip = !flip;
    const applied = tw.update(1 / 60, (o) => (flip ? o.copy(good) : o.set(NaN, 0, 0)), pos, tgt);
    assert.ok(Number.isFinite(pos.x) && Number.isFinite(tgt.x));
    if (!flip) assert.equal(applied, false); // NaN steps report "not applied"
  }
});

t("non-positive / non-finite dt never advances; cancel() keeps camera state", () => {
  const tw = new CameraTween();
  const pos = new Vector3(0, 0, 40);
  const tgt = new Vector3(0, 0, 0);
  tw.start(tgt.clone(), pos.clone(), 10);
  assert.equal(tw.update(0, (o) => o.set(5, 5, 5), pos, tgt), false);
  assert.equal(tw.update(NaN, (o) => o.set(5, 5, 5), pos, tgt), false);
  assert.ok(tgt.equals(new Vector3(0, 0, 0)) && pos.equals(new Vector3(0, 0, 40)));
  tw.cancel();
  assert.ok(tw.finished && !tw.active);
});

t("degenerate camera state (pos===target) picks a sane fallback direction", () => {
  const tw = new CameraTween();
  const pos = new Vector3(1, 1, 1);
  const tgt = new Vector3(1, 1, 1);
  tw.start(tgt.clone(), pos.clone(), 8);
  const outPos = pos.clone();
  const outTgt = tgt.clone();
  drive(tw, 1 / 60, (v) => v.set(10, 0, 0), outPos, outTgt, 90);
  assert.ok(outTgt.distanceTo(new Vector3(10, 0, 0)) < 1e-9);
  assert.ok(Math.abs(outPos.distanceTo(new Vector3(10, 0, 0)) - 8) < 1e-9);
  assert.ok(Number.isFinite(outPos.x) && Number.isFinite(outPos.y) && Number.isFinite(outPos.z));
});

t("duration is configurable and defaults to the shared camera constant", () => {
  const tw = new CameraTween();
  const pos = new Vector3();
  const tgt = new Vector3();
  tw.start(tgt.clone(), new Vector3(0, 0, 50), 10);
  const follow = (o) => o.set(0, 0, 0);
  const perFrame = CAMERA_TWEEN_SECONDS * 60; // frames needed at 60 fps
  drive(tw, 1 / 60, follow, pos, tgt, perFrame - 2);
  assert.ok(tw.active); // not finished early
  drive(tw, 1 / 60, follow, pos, tgt, 4);
  assert.ok(tw.finished);
  const fast = new CameraTween(0.5);
  assert.equal(fast.durationSeconds, 0.5); // constructor accepted
  assert.equal(new CameraTween(NaN).durationSeconds, CAMERA_TWEEN_SECONDS); // sanitised
});

console.log(`\n${n} camera-focus checks passed`);
