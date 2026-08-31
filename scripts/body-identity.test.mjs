/**
 * bodyIdentity contract tests (task t_766b495f).
 * Run: node scripts/body-identity.test.mjs
 * Verifies the ONE identification/selection-state contract downstream tasks
 * (raycaster t_06891a0f, camera focus t_31402ac4, labels/info t_d9203468)
 * rely on: mesh-child → body-root resolution, selection derivation
 * (system parent + focus anchor), and coordinate-frame rules.
 */
import assert from "node:assert/strict";
import { identity, data } from "./body-identity-harness.mjs";

const {
  BODY_ID_USERDATA_KEY,
  resolveBodyIdFromObject,
  systemParentOf,
  focusAnchorOf,
  selectionFor,
  coordFrameOf,
} = identity;
const { SOLAR_SYSTEM, getBodyById } = data;

let n = 0;
function t(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

// --- id/parent integrity of the dataset --------------------------------------

t("every moon has an existing parent in the dataset", () => {
  for (const b of SOLAR_SYSTEM) {
    if (b.type !== "moon") continue;
    assert.ok(b.parentId, `${b.id} moon missing parentId`);
    const p = getBodyById(b.parentId);
    assert.ok(p, `${b.id} parent ${b.parentId} not found`);
    assert.ok(p.type === "planet" || p.type === "dwarf-planet");
  }
});

t("ids are unique (stable identity key)", () => {
  const ids = SOLAR_SYSTEM.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- mesh-child → body-root resolution ---------------------------------------

t("direct hit on a body node resolves its own id", () => {
  const mesh = { userData: { [BODY_ID_USERDATA_KEY]: "jupiter" }, parent: null };
  assert.equal(resolveBodyIdFromObject(mesh), "jupiter");
});

t("child without userData resolves through the parent chain (ring → planet)", () => {
  const ring = { userData: {}, parent: { userData: { [BODY_ID_USERDATA_KEY]: "saturn" }, parent: null } };
  assert.equal(resolveBodyIdFromObject(ring), "saturn");
});

t("deepest valid id wins (moon mesh under a planet group)", () => {
  const moonMesh = {
    userData: { [BODY_ID_USERDATA_KEY]: "io" },
    parent: { userData: { [BODY_ID_USERDATA_KEY]: "jupiter" }, parent: null },
  };
  assert.equal(resolveBodyIdFromObject(moonMesh), "io");
});

t("unknown/stale ids are skipped, walk continues", () => {
  const stray = {
    userData: { [BODY_ID_USERDATA_KEY]: "not-a-body" },
    parent: { userData: { [BODY_ID_USERDATA_KEY]: "mars" }, parent: null },
  };
  assert.equal(resolveBodyIdFromObject(stray), "mars");
});

t("empty space / null / non-string userData resolve to null (never throw)", () => {
  assert.equal(resolveBodyIdFromObject(null), null);
  assert.equal(resolveBodyIdFromObject(undefined), null);
  assert.equal(resolveBodyIdFromObject({ userData: {}, parent: null }), null);
  assert.equal(resolveBodyIdFromObject({ userData: { [BODY_ID_USERDATA_KEY]: 42 }, parent: null }), null);
  assert.equal(resolveBodyIdFromObject({}), null);
});

// --- selection-state derivation ----------------------------------------------

t("planet selection: system and anchor are itself", () => {
  const s = selectionFor("jupiter");
  assert.deepEqual(s, { selectedId: "jupiter", systemParentId: "jupiter", focusAnchorId: "jupiter" });
});

t("moon selection: system and anchor are its PARENT (parent-local rule)", () => {
  const s = selectionFor("io");
  assert.equal(s.selectedId, "io");
  assert.equal(s.systemParentId, "jupiter");
  assert.equal(s.focusAnchorId, "jupiter");
});

t("dwarf-planet (pluto) selects itself as system/anchor", () => {
  const s = selectionFor("pluto");
  assert.equal(s.systemParentId, "pluto");
  assert.equal(s.focusAnchorId, "pluto");
});

t("sun selection: no system reveal, no focus anchor (global view)", () => {
  const s = selectionFor("sun");
  assert.equal(s.selectedId, "sun");
  assert.equal(s.systemParentId, null);
  assert.equal(s.focusAnchorId, null);
});

t("null/unknown selection is the full global state", () => {
  for (const id of [null, undefined, ""]) {
    assert.deepEqual(selectionFor(id), {
      selectedId: null,
      systemParentId: null,
      focusAnchorId: null,
    });
  }
});

t("selectionFor matches systemParentOf/focusAnchorOf for EVERY body", () => {
  for (const b of SOLAR_SYSTEM) {
    const s = selectionFor(b.id);
    assert.equal(s.systemParentId, systemParentOf(b), b.id);
    assert.equal(s.focusAnchorId, focusAnchorOf(b), b.id);
  }
});

// --- coordinate frames ---------------------------------------------------------

t("moons render in parent-local space; planets/star in scene space", () => {
  for (const b of SOLAR_SYSTEM) {
    assert.equal(
      coordFrameOf(b),
      b.type === "moon" ? "parent-local" : "scene",
      b.id,
    );
  }
});

console.log(`\n${n} bodyIdentity checks passed`);
