/**
 * overlayState contract tests (task t_30700e13).
 * Run: node scripts/overlay-state.test.mjs
 * Verifies the interaction rules between per-panel and global state,
 * localStorage round-trip/robustness parsing, and the body-selected event
 * contract that auto-shows the info panel.
 */
import assert from "node:assert/strict";
import { mod } from "./overlay-state-harness.mjs";

const {
  PANEL_IDS,
  STORAGE_KEY,
  BODY_SELECTED_EVENT,
  defaultOverlayState,
  parseOverlayState,
  effectiveVisible,
  togglePanel,
  toggleAll,
  restoreAll,
  stateWithBodySelected,
  isBodySelectedDetail,
} = mod;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

t("panel ids are header/control/info", () => {
  assert.deepEqual([...PANEL_IDS], ["header", "control", "info"]);
});

t("defaults: everything visible", () => {
  const s = defaultOverlayState();
  for (const id of PANEL_IDS) assert.equal(effectiveVisible(s, id), true);
});

t("per-panel collapse hides only that panel", () => {
  let s = defaultOverlayState();
  s = togglePanel(s, "control");
  assert.equal(effectiveVisible(s, "control"), false);
  assert.equal(effectiveVisible(s, "header"), true);
  assert.equal(effectiveVisible(s, "info"), true);
  s = togglePanel(s, "control");
  assert.equal(effectiveVisible(s, "control"), true);
});

t("toggleAll hides everything and keeps per-panel flags", () => {
  let s = defaultOverlayState();
  s = togglePanel(s, "info"); // info individually collapsed
  s = toggleAll(s); // global hide
  for (const id of PANEL_IDS) assert.equal(effectiveVisible(s, id), false);
  assert.equal(s.collapsed.info, true, "individual flag preserved");
  s = toggleAll(s); // restore
  assert.equal(effectiveVisible(s, "info"), false, "layout restored as before");
  assert.equal(effectiveVisible(s, "header"), true);
});

t("expanding one panel while globally collapsed exits global state only for it", () => {
  let s = toggleAll(defaultOverlayState());
  s = togglePanel(s, "control");
  assert.equal(s.collapsedAll, false, "global state released");
  assert.equal(effectiveVisible(s, "control"), true);
  assert.equal(effectiveVisible(s, "header"), true, "others were not individually collapsed");
  assert.equal(s.collapsed.header, false);
});

t("restoreAll clears individual + global at once", () => {
  let s = togglePanel(defaultOverlayState(), "header");
  s = toggleAll(s);
  s = restoreAll(s);
  assert.deepEqual(s, defaultOverlayState());
});

t("body-selected shows info panel from any collapsed state", () => {
  let s = stateWithBodySelected(toggleAll(defaultOverlayState()));
  assert.equal(effectiveVisible(s, "info"), true);
  assert.equal(s.collapsedAll, false);
  s = stateWithBodySelected(togglePanel(defaultOverlayState(), "info"));
  assert.equal(effectiveVisible(s, "info"), true);
  // untouched panels keep their individual state
  s = stateWithBodySelected(togglePanel(defaultOverlayState(), "header"));
  assert.equal(effectiveVisible(s, "header"), false);
});

t("parse: null/garbage/non-JSON fall back to defaults", () => {
  for (const bad of [null, undefined, "", "{oops", "[1,2]", '"x"', "123"]) {
    assert.deepEqual(parseOverlayState(bad), defaultOverlayState(), `input ${bad}`);
  }
});

t("parse: partial and unknown keys are tolerated/filtered", () => {
  const p = parseOverlayState(
    JSON.stringify({ collapsedAll: true, collapsed: { info: true, titan: true }, junk: 1 }),
  );
  assert.equal(p.collapsedAll, true);
  assert.equal(p.collapsed.info, true);
  assert.equal(p.collapsed.header, false);
  assert.equal(p.collapsed.titan, undefined);
});

t("persistence key is stable", () => {
  assert.equal(typeof STORAGE_KEY, "string");
  assert.match(STORAGE_KEY, /^qwsolar\.overlay\./);
});

t("selection event contract: name + detail guard", () => {
  assert.equal(BODY_SELECTED_EVENT, "qw:body-selected");
  assert.equal(isBodySelectedDetail({ id: "earth" }), true);
  assert.equal(isBodySelectedDetail({ id: 1 }), false);
  assert.equal(isBodySelectedDetail(null), false);
  assert.equal(isBodySelectedDetail({}), false);
});

console.log(`\nall ${n} overlay-state tests passed`);
