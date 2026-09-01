/**
 * main.ts — app bootstrap: renderer, camera, OrbitControls, raycaster
 * selection/focus, simulation loop, HUD wiring. UI panel show/hide state
 * management is owned by task t_30700e13; hooks exposed here.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

import "./styles.css";
import { getBodyById } from "./data/solarSystemData";
import { validateSolarSystem, formatIssues } from "./data/validateSolarSystem";
import { ScaleManager } from "./core/ScaleManager";
import { SimulationClock } from "./core/SimulationClock";
import { SolarSystem } from "./core/SolarSystem";
import {
  resolveBodyIdFromObject,
  selectionFor,
  systemParentOf,
  type PickableNode,
} from "./core/bodyIdentity";
import { ndcFromClientPoint } from "./core/pickCoords";
import { TapGestureTracker } from "./core/pointerGesture";
import {
  CameraTween,
  cameraFocusDistance,
  type FocusInput,
  type FollowFn,
} from "./core/CameraTween";
import { InfoPanel } from "./ui/InfoPanel";
import { ControlPanel } from "./ui/ControlPanel";
import { Labels } from "./ui/Labels";
import { OverlayManager } from "./ui/OverlayManager";
import { BODY_SELECTED_EVENT } from "./ui/overlayState";

// Listener accounting (integration t_92052608, VITE_VERIFY builds ONLY —
// dead code in dev/prod): counts add/remove per (target-kind, event-type) and
// maintains a SATURATING live counter (extra removeEventListener calls for
// handlers that are already gone — OrbitControls does this on dispose — must
// not push the live count negative). The browser check asserts the app-owned
// keys are fully live while mounted and back to zero after teardown, proving
// nothing accumulates across a dispose/remount cycle. MUST be installed
// before ANY listener is registered, hence its position right after imports.
if (import.meta.env.VITE_VERIFY === "1") {
  const stats: Record<string, { added: number; removed: number; live: number }> = {};
  const key = (t: EventTarget, ty: string) =>
    `${t instanceof Window ? "window" : t instanceof Document ? "document" : t instanceof HTMLElement ? "element" : "other"}:${ty}`;
  const proto = EventTarget.prototype;
  const origAdd = proto.addEventListener;
  const origRem = proto.removeEventListener;
  proto.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
    const s = (stats[key(this, type)] ??= { added: 0, removed: 0, live: 0 });
    s.added++;
    s.live++;
    return origAdd.call(this, type as string, ...(rest as [never, AddEventListenerOptions | boolean | undefined]));
  } as typeof origAdd;
  proto.removeEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
    const s = (stats[key(this, type)] ??= { added: 0, removed: 0, live: 0 });
    s.removed++;
    s.live = Math.max(0, s.live - 1);
    return origRem.call(this, type as string, ...(rest as [never, EventListenerOptions | boolean | undefined]));
  } as typeof origRem;
  (window as unknown as { __qwListenerStats?: () => Record<string, { added: number; removed: number; live: number }> }).__qwListenerStats =
    () => JSON.parse(JSON.stringify(stats));
}

// --- data sanity in dev (spec §15; silent in prod) --------------------------
const issues = validateSolarSystem();
const fatal = issues.filter((i) => i.severity === "error");
if (import.meta.env.DEV) {
  console.info(formatIssues(issues));
}
if (fatal.length > 0) {
  // Still render, but make dataset problems impossible to miss.
  console.error(formatIssues(fatal));
}

// --- scene / renderers ------------------------------------------------------
const viewport = document.getElementById("viewport") as HTMLElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04050c);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  6000,
);
// Slightly oblique start showing Sun→Pluto (spec §9).
camera.position.set(0, 150, 260);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // spec §16
renderer.setSize(window.innerWidth, window.innerHeight);
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.inset = "0";
labelRenderer.domElement.style.pointerEvents = "none";
viewport.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1;
controls.maxDistance = 1500;

// --- overlay panel toggle system (task t_30700e13) --------------------------
const overlay = new OverlayManager(viewport);

// --- state ------------------------------------------------------------------
const scale = new ScaleManager();
const clock = new SimulationClock();
const solar = new SolarSystem(scene, scale);
const labels = new Labels();
labels.attach(solar);

let selectedId: string | null = null;

const info = new InfoPanel(viewport, scale, (b) => {
  const body = solar.bodies.get(b.id);
  const dist = scale.renderedDistanceOf(
    b.id,
    clock.simDays,
    body?.moonDistanceRange ?? null,
    body?.parentRenderRadius ?? 1,
  );
  return {
    distance: dist?.units ?? 0,
    radius: body?.renderRadius ?? scale.mapBodyRadius(b),
    fromLabelKo: dist?.fromLabelKo ?? "—",
  };
});
// Live real distances in the panel read the same sim clock as the scene.
info.setSimDaysProvider(() => clock.simDays);

// Header + disclaimer (spec §14).
const header = document.createElement("header");
header.className = "panel header";
header.innerHTML =
  "<h1>로그 태양계 · Logarithmic Solar System</h1>" +
  '<p class="sub">실제 천문 데이터를 로그 스케일로 압축한 시각화입니다.</p>';
viewport.appendChild(header);
overlay.register("header", header);

const disclaimer = document.createElement("aside");
disclaimer.className = "panel disclaimer";
disclaimer.textContent =
  "이 시각화는 실제 천문 데이터를 사용하지만, 궤도 거리는 로그 스케일로 압축되고 천체 크기는 화면 가독성을 위해 과장됩니다. 렌더 크기와 렌더 거리는 하나의 동일한 물리 스케일을 공유하지 않습니다.";
viewport.appendChild(disclaimer);

// --- camera focus tween (ease-in-out, spec §9; task t_31402ac4) -------------
// The flight itself lives in core/CameraTween.ts. ONE path re-frames the
// camera for every focus event (selection, distance-mode change, reset):
// reframeCamera() derives the DISTANCE through cameraFocusDistance() fed by
// focusFrameFor() — computed from ScaleManager AFTER the new selection
// state is applied, so the camera and the focus-mode scale mapping draw
// from the same numbers and can never disagree (spec §4/§13). The tween
// starts from the camera's ACTUAL state (mid-flight re-select cancels the
// previous leg safely) and re-reads the body's live world position each
// step, so a moving body leaves target and final position consistent.
const cameraTween = new CameraTween();
const camOutPos = new THREE.Vector3();
const camOutTarget = new THREE.Vector3();
/** Global-view follow anchor: the scene origin (Sun-centred framing). */
const GLOBAL_FOLLOW: FollowFn = (out) => out.set(0, 0, 0);
let followFn: FollowFn = GLOBAL_FOLLOW;

/**
 * Render-unit inputs for the focus-distance mapping, evaluated in the
 * DESTINATION state (call AFTER scale.selectedId is set — the §13 system
 * boost and moon-band expansion are then baked in exactly as the scene will
 * render them). Moons map against their PARENT-LOCAL satellite system —
 * the parent's rendered moon ring, not the whole solar system (spec §5/§13).
 */
function focusFrameFor(id: string): FocusInput | null {
  const body = solar.bodies.get(id);
  if (!body) return null;
  const d = body.data;
  // Raw (size-mode only) vs effective (as-rendered, boost included) radius
  // are deliberately separate — the camera frames the effective one.
  const { raw, effective } = scale.bodyRadiusPair(d);
  const systemKey = systemParentOf(d); // moon → parent, planet → itself
  let systemExtent = 0;
  if (systemKey) {
    // moonDistanceRange lives on the MOON bodies (SolarSystem.computeMoonRanges
    // shares the system-wide a(1±e) span with every sibling) — read it from a
    // child, never from the parent.
    let range: { minKm: number; maxKm: number } | null = null;
    for (const b of solar.bodies.values()) {
      if (b.data.type === "moon" && b.data.parentId === systemKey) {
        range = b.moonDistanceRange;
        break;
      }
    }
    const sys = solar.bodies.get(systemKey);
    if (sys && range) {
      const parentEffective = scale.mapBodyRadius(sys.data);
      systemExtent = scale.mapSatelliteDistance(
        range.maxKm,
        range.minKm,
        range.maxKm,
        parentEffective,
      );
    }
  }
  if (d.render?.hasRings) {
    // Ring outer edge in render units (outer scale × rendered radius).
    systemExtent = Math.max(systemExtent, effective * (d.render.ringOuterScale ?? 2.3));
  }
  return {
    type: d.type,
    rawRenderRadius: raw,
    effectiveRenderRadius: effective,
    systemBoosted: systemKey !== null && systemKey === id && scale.systemBoostActive,
    systemExtent,
  };
}

/** Start the camera flight toward the CURRENT selection in its new state. */
function reframeCamera(): void {
  const input = selectedId ? focusFrameFor(selectedId) : null;
  const dist = cameraFocusDistance(input);
  const body = selectedId ? solar.bodies.get(selectedId) : undefined;
  // getWorldPosition: moons are parent-local (bodyIdentity.coordFrameOf) —
  // scene-coordinate math ALWAYS goes through world space.
  followFn = body ? (out) => body.group.getWorldPosition(out) : GLOBAL_FOLLOW;
  cameraTween.start(controls.target, camera.position, dist);
}

function focusOn(id: string | null): void {
  // ONE derivation for the whole selection state (task t_766b495f contract):
  // focusAnchorId (moon → parent, star → null) and systemParentId come from
  // core/bodyIdentity.ts — camera focus and scale focus can never disagree.
  const sel = selectionFor(id);
  selectedId = sel.selectedId;
  scale.selectedId = sel.selectedId;
  scale.focusAnchorId = sel.focusAnchorId;
  solar.setSystemRevealed(sel.selectedId);
  solar.animateScaleChange();
  for (const [bid, orbit] of solar.orbits) {
    orbit.setHighlighted(bid === id);
  }
  // Camera half of the SAME path (t_31402ac4): distance mapping + tween both
  // read the state just applied here; a mid-flight call simply re-starts
  // from the live camera state.
  reframeCamera();
}

// --- picking (spec §10; tap contract t_06891a0f) -----------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/**
 * Pick at a viewport point in CSS px (event clientX/clientY). NDC comes from
 * core/pickCoords.ndcFromClientPoint against a FRESH getBoundingClientRect():
 * dpr-independent (NDC is CSS-pixel geometry), resize-safe (the rect is never
 * cached), and correct under rotated viewports. A degenerate zero-size rect
 * returns null — the raycaster is never fed NaN/Infinity.
 * intersectObjects sorts ascending, so the FIRST hit that resolves to a real
 * dataset body (parent-chain walk, core/bodyIdentity) is the nearest valid
 * intersection. Empty space returns null; nothing ever throws (spec §10).
 */
function pickAt(clientX: number, clientY: number): string | null {
  const ndc = ndcFromClientPoint(
    clientX,
    clientY,
    renderer.domElement.getBoundingClientRect(),
  );
  if (!ndc) return null;
  pointer.set(ndc.x, ndc.y);
  raycaster.setFromCamera(pointer, camera);
  // recursive=true: clicks on a body's children (ring mesh, tilt-frame
  // descendants, any future decoration) must resolve too — the parent-chain
  // walk in resolveBodyIdFromObject maps them to the owning body root.
  const hits = raycaster.intersectObjects(solar.pickTargets(), true);
  for (const h of hits) {
    const id = resolveBodyIdFromObject(h.object as unknown as PickableNode);
    if (id) return id;
  }
  return null;
}

/**
 * Single call site for body selection (spec: overlay task event contract).
 * Raycast clicks and programmatic selection both go through here; the
 * `qw:body-selected` event lets the overlay auto-show the info panel even
 * from an individual/global collapsed state. Tests can dispatch the event
 * directly or call window.__qwSelect(id).
 */
function selectBody(id: string): void {
  focusOn(id);
  info.showBody(id);
  window.dispatchEvent(
    new CustomEvent(BODY_SELECTED_EVENT, { detail: { id } satisfies { id: string } }),
  );
}
(window as unknown as { __qwSelect?: (id: string) => void }).__qwSelect = selectBody;

/**
 * Pointer lifecycle (t_06891a0f): ONE tracker mediates every pointerdown/up/
 * cancel, so the tap decision is pure, unit-tested logic (core/pointerGesture)
 * rather than ad-hoc state in the listeners. Desktop click and touch tap both
 * arrive as pointer events; an OrbitControls drag past the tolerance and any
 * multi-touch (pinch) gesture are never re-interpreted as a tap-select.
 * Registered ONCE here on the canvas; removed by teardown() below.
 */
const tapGesture = new TapGestureTracker();

/** Pointer-flow counters for the browser check (t_06891a0f): how many
 *  pointerdown/up actually reached the canvas vs how many became taps.
 *  `frames` (t_92052608) lets the integration check prove the rAF loop stops
 *  after teardown: it must stop growing once __qwTeardownAll() is called. */
const diag = {
  downs: 0,
  ups: 0,
  taps: 0,
  cancels: 0,
  frames: 0,
  lastTapPick: null as string | null,
};

const onPointerDown = (ev: PointerEvent): void => {
  diag.downs++;
  tapGesture.down(ev.pointerId, ev.clientX, ev.clientY);
};
const onPointerUp = (ev: PointerEvent): void => {
  diag.ups++;
  const tap = tapGesture.up(ev.pointerId, ev.clientX, ev.clientY);
  if (!tap) return; // drag / pinch member / stray up — leave OrbitControls' work alone
  diag.taps++;
  const id = pickAt(tap.x, tap.y);
  diag.lastTapPick = id;
  if (id) selectBody(id); // empty space → no selection change, never an error
};
const onPointerCancel = (ev: PointerEvent): void => {
  diag.cancels++;
  tapGesture.cancel(ev.pointerId);
};
const onDoubleClick = (ev: MouseEvent): void => {
  // Deselect only when the double-click lands on empty space.
  if (!pickAt(ev.clientX, ev.clientY)) {
    focusOn(null);
    info.hide();
  }
};
const onPointerMove = (ev: PointerEvent): void => {
  // While a pointer is down (orbit drag in progress) skip the hover pick —
  // the tooltip would chase a camera that is deliberately moving (spec §10).
  if (tapGesture.activeCount > 0) {
    info.hideTooltip();
    return;
  }
  const id = pickAt(ev.clientX, ev.clientY);
  if (id) {
    const b = getBodyById(id);
    if (b) info.showTooltip(ev.clientX, ev.clientY, b);
    renderer.domElement.style.cursor = "pointer";
  } else {
    info.hideTooltip();
    renderer.domElement.style.cursor = "default";
  }
};

const canvas = renderer.domElement;
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerCancel);
canvas.addEventListener("dblclick", onDoubleClick);
canvas.addEventListener("pointermove", onPointerMove);

/** Remove every canvas listener this module added (component/scene teardown). */
function teardownPicking(): void {
  canvas.removeEventListener("pointerdown", onPointerDown);
  canvas.removeEventListener("pointerup", onPointerUp);
  canvas.removeEventListener("pointercancel", onPointerCancel);
  canvas.removeEventListener("dblclick", onDoubleClick);
  canvas.removeEventListener("pointermove", onPointerMove);
}

// --- control panel (spec §8, §14) --------------------------------------------
const controlPanel = new ControlPanel(viewport, {
  onPlay: () => clock.setPlaying(true),
  onPause: () => clock.setPlaying(false),
  onReset: () => {
    clock.reset();
    solar.refreshScales(clock.simDays);
    focusOn(null);
    info.hide();
  },
  onTimeScale: (d) => clock.setTimeScale(d),
  onDistanceMode: (m) => {
    scale.distanceMode = m;
    if (m === "focus" && !scale.focusAnchorId) scale.focusAnchorId = "earth";
    solar.animateScaleChange();
    // Focus mode RE-CENTRES the scene on its anchor (and leaving it moves
    // everything back), so the camera re-frames through the SAME tween path
    // as a selection — one consistent route, no competing target updates.
    reframeCamera();
  },
  onSizeMode: (m) => {
    scale.sizeMode = m;
    solar.animateScaleChange();
  },
  onToggleOrbits: (v) => solar.setOrbitsVisible(v),
  onToggleLabels: (v) => labels.setVisible(v),
  onToggleMoons: (v) => {
    for (const b of solar.bodies.values()) {
      if (b.data.type === "moon") b.group.visible = v;
    }
  },
  onToggleStars: (v) => solar.setStarFieldVisible(v),
  onResetCamera: () => {
    focusOn(null);
    info.hide();
  },
});

// Register panels with the overlay toggle system (t_30700e13).
overlay.register("control", controlPanel.element);
overlay.register("info", info.element);

// --- resize + dispose --------------------------------------------------------
function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

// The frame loop owns ONE rAF chain: frame() re-schedules itself, so a single
// cancelAnimationFrame on the pending handle stops the loop completely —
// nothing re-schedules after teardown (integration t_92052608).
let rafId = 0;

/**
 * FULL runtime teardown (integration t_92052608): every listener this module
 * added, OrbitControls' own canvas listeners, and the animation frame chain
 * all go away together, so nothing accumulates across a dispose/remount
 * cycle. Idempotent — a second call is a no-op.
 */
function teardownAll(): void {
  cancelAnimationFrame(rafId); // stops the loop: frame() will not re-arm
  teardownPicking(); // canvas pointer listeners go with the scene (t_06891a0f)
  controls.dispose(); // OrbitControls' pointer/wheel listeners on the canvas
  window.removeEventListener("resize", onResize);
  window.removeEventListener("beforeunload", onTeardown);
  overlay.dispose();
  solar.dispose();
  renderer.dispose();
}
const onTeardown = (): void => {
  teardownAll();
};
window.addEventListener("beforeunload", onTeardown);
// Test/verification hook: removes ONLY the picking listeners added by this
// module (same convention as always-exposed __qwSelect). After calling it the
// canvas is inert to clicks/taps; scene resources are untouched.
(window as unknown as { __qwTeardownPicking?: () => void }).__qwTeardownPicking =
  teardownPicking;
// Test/verification hook: FULL teardown — listeners + rAF loop + resources.
// Used by the integration check to prove nothing accumulates after dispose.
(window as unknown as { __qwTeardownAll?: () => void }).__qwTeardownAll =
  teardownAll;

// --- initial layout + loop ---------------------------------------------------
solar.refreshScales(0);
// Frame whole system on load (spec §9: oblique view, Sun→Pluto fits).
camera.position.set(0, 150, 260);
controls.target.set(0, 0, 0);

const YR_DAYS = 365.25;
function formatSimDate(): string {
  const d = clock.simDays;
  if (d < YR_DAYS) return `${d.toFixed(1)} 일 경과`;
  return `${(d / YR_DAYS).toFixed(2)} 년 경과`;
}

let lastHud = 0;
function frame(realMs: number): void {
  rafId = requestAnimationFrame(frame);
  diag.frames++;
// Enabled with `npm run dev -- --mode verify` (or VITE_VERIFY=1); never
// active in a normal dev/prod run, so the shipped demo stays clean.
if (import.meta.env.VITE_VERIFY === "1") {
  interface QwVerifyApi {
    setDistanceMode(m: DistanceMode): void;
    setSizeMode(m: SizeMode): void;
    select(id: string | null): void;
    report(): {
      simDays: number;
      bodies: number;
      finite: boolean;
      helioRenderPos: Record<string, [number, number, number]>;
      selectedRadius: number | null;
    };
  }
  const api: QwVerifyApi = {
    setDistanceMode: (m) => {
      scale.distanceMode = m;
      if (m === "focus" && !scale.focusAnchorId) scale.focusAnchorId = "earth";
      solar.animateScaleChange();
    },
    setSizeMode: (m) => {
      scale.sizeMode = m;
      solar.animateScaleChange();
    },
    select: (id) => {
      focusOn(id);
      if (id) info.showBody(id);
      else info.hide();
    },
    report: () => {
      const pos: Record<string, [number, number, number]> = {};
      let finite = true;
      for (const [id, b] of solar.bodies) {
        if (b.data.type === "moon") continue;
        const p = b.group.position;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) finite = false;
        pos[id] = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      }
      return {
        simDays: +clock.simDays.toFixed(3),
        bodies: solar.bodies.size,
        finite,
        helioRenderPos: pos,
        selectedRadius: selectedId ? (solar.bodies.get(selectedId)?.renderRadius ?? null) : null,
      };
    },
  };
  (window as unknown as { __qwVerify?: QwVerifyApi }).__qwVerify = api;
}
  clock.update(realMs);
  solar.update(clock.simDays);

  if (tween) {
    tween.t = Math.min(1, tween.t + 0.02);
    const k = easeInOut(tween.t);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    const toPos = tween.toTarget.clone();
    const dir = tween.fromPos.clone().sub(tween.fromTarget).normalize();
    const desired = toPos.clone().addScaledVector(dir, tween.dist);
    camera.position.lerp(desired, k * 0.2 + 0.06);
    if (tween.t >= 1) tween = null;
  }

  controls.update();
  labels.update(solar, selectedId, camera);

  if (realMs - lastHud > 200) {
    lastHud = realMs;
    // HUD update only when necessary (spec §16)
    (window as unknown as { __qwClock?: (t: string) => void }).__qwClock?.(formatSimDate());
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// expose clock text hook to control panel without class coupling
const clockElGetter = (): HTMLElement | null =>
  viewport.querySelector<HTMLElement>(".sim-clock");
(window as unknown as { __qwClock?: (t: string) => void }).__qwClock = (t: string) => {
  const el = clockElGetter();
  if (el) el.textContent = t;
};

requestAnimationFrame(frame);

// --- optional interaction-free test API (verification builds only) ----------
// Enabled with VITE_VERIFY=1; with ?autotest=1 in the URL it also runs a
// scripted mode-switch/selection sweep and logs `QWVERIFY {json}` lines.
// Never active in a normal dev/prod run, so the shipped demo stays clean.
if (import.meta.env.VITE_VERIFY === "1") {
  interface QwVerifyReport {
    simDays: number;
    bodies: number;
    finite: boolean;
    maxAbs: number;
    rings: number;
    starsVisible: boolean;
    labelsVisible: number;
    helioRenderPos: Record<string, [number, number, number]>;
    selectedRadius: number | null;
    moonRenderMax: number;
  }
  const report = (): QwVerifyReport => {
    const pos: Record<string, [number, number, number]> = {};
    let finite = true;
    let maxAbs = 0;
    let moonRenderMax = 0;
    for (const [id, b] of solar.bodies) {
      const p = b.group.position;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) finite = false;
      const m = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
      if (b.data.type === "moon") moonRenderMax = Math.max(moonRenderMax, m);
      else {
        pos[id] = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
        maxAbs = Math.max(maxAbs, m);
      }
    }
    let rings = 0;
    let starsVisible = false;
    scene.traverse((o) => {
      if (o.name.startsWith("ring:")) rings++;
      const asPoints = o as THREE.Points;
      if (asPoints.isPoints) starsVisible = starsVisible || asPoints.visible;
    });
    let labelsVisible = 0;
    for (const l of solar.labelObjects.values()) if (l.visible) labelsVisible++;
    return {
      simDays: +clock.simDays.toFixed(3),
      bodies: solar.bodies.size,
      finite,
      maxAbs: +maxAbs.toFixed(1),
      rings,
      starsVisible,
      labelsVisible,
      helioRenderPos: pos,
      selectedRadius: selectedId ? (solar.bodies.get(selectedId)?.renderRadius ?? null) : null,
      moonRenderMax: +moonRenderMax.toFixed(2),
    };
  };
  const api = {
    setDistanceMode: (m: "log" | "linear" | "focus") => {
      scale.distanceMode = m;
      if (m === "focus" && !scale.focusAnchorId) scale.focusAnchorId = "earth";
      solar.animateScaleChange();
      reframeCamera(); // same unified focus path as the UI (t_31402ac4)
    },
    setSizeMode: (m: "enhanced" | "relative" | "uniform") => {
      scale.sizeMode = m;
      solar.animateScaleChange();
    },
    select: (id: string | null) => {
      // Same single entry as real clicks: focus + panel content + overlay
      // auto-restore via qw:body-selected (t_30700e13 contract).
      if (id) selectBody(id);
      else {
        focusOn(null);
        info.hide();
      }
    },
    /** Deterministic time travel for headless verification (no rAF needed). */
    setSimDays: (days: number) => {
      clock.reset(days);
      solar.refreshScales(days);
    },
    /** Transport wiring for headless verification (spec §8). */
    setPlaying: (v: boolean) => clock.setPlaying(v),
    setTimeScale: (d: number) => clock.setTimeScale(d),
    resetClock: () => {
      clock.reset();
      solar.refreshScales(clock.simDays);
    },
    clockState: () => ({
      simDays: +clock.simDays.toFixed(4),
      playing: clock.playing,
      daysPerSecond: clock.daysPerSecond,
    }),
    /** Body's absolute world position (finite-check helper). */
    worldPos: (id: string) => {
      const b = solar.bodies.get(id);
      if (!b) return null;
      const v = new THREE.Vector3();
      b.group.getWorldPosition(v);
      return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    },
    /** Axial spin angle (rad) of a body's mesh — for rotation verification. */
    spinRad: (id: string) => {
      const m = solar.bodies.get(id)?.mesh;
      return m ? +m.rotation.y.toFixed(4) : null;
    },
    /**
     * Render radius + projected screen point (CSS px, viewport-page space)
     * of a body — lets browser checks (t_06891a0f picking regression) click
     * exactly ON a body without hardcoding positions. Same NDC convention
     * as picking, inverted.
     */
    bodyScreen(id: string) {
      const b = solar.bodies.get(id);
      if (!b) return null;
      const v = new THREE.Vector3();
      b.group.getWorldPosition(v);
      v.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        renderRadius: +b.renderRadius.toFixed(3),
        x: +((v.x * 0.5 + 0.5) * rect.width + rect.left).toFixed(2),
        y: +((-v.y * 0.5 + 0.5) * rect.height + rect.top).toFixed(2),
        onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1,
      };
    },
    /** Project an arbitrary WORLD point to screen (CSS px) + NDC — used by
     *  the orbit-shape browser check (t_b4bcc438) to prove a projected orbit
     *  ring CONTAINS its parent's projected centre (perspective interior test). */
    projectWorld(x: number, y: number, z: number) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: +((v.x * 0.5 + 0.5) * rect.width + rect.left).toFixed(2),
        y: +((-v.y * 0.5 + 0.5) * rect.height + rect.top).toFixed(2),
        ndcZ: +v.z.toFixed(4),
      };
    },
    /** Selection state of record (raycast/programmatic — whatever happened),
     *  derived through the ONE contract (core/bodyIdentity.selectionFor). */
    selectedState: () => selectionFor(selectedId),
    /** Pointer-flow counters (browser-check diagnostics, t_06891a0f). */
    pointerDiag: () => ({ ...diag }),
    /** Pointer-flow counters (browser-check diagnostics, t_06891a0f). */
    pointerDiag: () => ({ ...diag }),
    /**
     * Run the pick math at a viewport point WITHOUT any selection side
     * effect (t_06891a0f browser check): resolves the id via the same
     * parent-chain walk and also reports the DIRECT hit mesh name so the
     * ring-mesh→planet child rule can be proven, not just inferred.
     */
    pickProbe(x: number, y: number) {
      const ndc = ndcFromClientPoint(
        x,
        y,
        renderer.domElement.getBoundingClientRect(),
      );
      if (!ndc) return { id: null, direct: null, hits: 0 };
      const p = new THREE.Vector2(ndc.x, ndc.y);
      const probe = new THREE.Raycaster();
      probe.setFromCamera(p, camera);
      const hits = probe.intersectObjects(solar.pickTargets(), true);
      for (const h of hits) {
        const id = resolveBodyIdFromObject(h.object as unknown as PickableNode);
        if (id) return { id, direct: h.object.name || null, hits: hits.length };
      }
      return { id: null, direct: null, hits: hits.length };
    },
    /** Screen point (CSS px, page space) k × render-radius to the CAMERA-RIGHT
     *  of a body's centre — same depth, so ≈ k render radii on screen. Lets
     *  picking checks hit e.g. Saturn's ring annulus (1 < k < ringOuterScale)
     *  deterministically without hardcoded coordinates. */
    bodyScreenOffset(id: string, k: number) {
      const b = solar.bodies.get(id);
      if (!b) return null;
      const world = new THREE.Vector3();
      b.group.getWorldPosition(world);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const p = world.clone().addScaledVector(right, k * b.renderRadius);
      p.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: +((p.x * 0.5 + 0.5) * rect.width + rect.left).toFixed(2),
        y: +((-p.y * 0.5 + 0.5) * rect.height + rect.top).toFixed(2),
        onScreen: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1,
        k,
      };
    },
    /**
     * Camera-focus contract (t_31402ac4): where the camera/target are vs the
     * followed body's CURRENT world position. `gap` is target−world; the
     * autotest asserts it converges to ~0 with finite, NaN-free values.
     */
    cameraState: () => {
      const tgt = controls.target;
      const p = camera.position;
      const anchorId = scale.selectedId ?? null;
      const body = anchorId ? solar.bodies.get(anchorId) : undefined;
      const world = new THREE.Vector3();
      if (body) body.group.getWorldPosition(world);
      return {
        anchorId,
        tweenActive: cameraTween.active,
        tweenProgress: +cameraTween.progressValue.toFixed(3),
        tweenDistance: +cameraTween.lastDistance.toFixed(2),
        target: [+tgt.x.toFixed(3), +tgt.y.toFixed(3), +tgt.z.toFixed(3)],
        position: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)],
        world: body
          ? [+world.x.toFixed(3), +world.y.toFixed(3), +world.z.toFixed(3)]
          : [0, 0, 0],
        gap: body
          ? +tgt.distanceTo(world).toFixed(3)
          : +tgt.length().toFixed(3),
        camDist: +p.distanceTo(tgt).toFixed(2),
        finite:
          Number.isFinite(tgt.x) && Number.isFinite(tgt.y) && Number.isFinite(tgt.z) &&
          Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
      };
    },
    /**
     * Orbit-shape browser check (t_b4bcc438): raw DRAWN vertices of a body's
     * orbit line in its container space (moons: parent-local, exactly what
     * OrbitRenderer wrote; heliocentric: scene/root space incl. focus-mode
     * compression), plus visibility state. Reads the live buffer — the very
     * geometry the GPU rasterises, no reimplementation.
     */
    orbitSamples: (id: string) => {
      const o = solar.orbits.get(id);
      if (!o) return null;
      const attr = o.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < attr.count; i++) pts.push([attr.getX(i), attr.getY(i), attr.getZ(i)]);
      return {
        pts,
        visible: o.line.visible,
        opacity: +(o.line.material as THREE.LineBasicMaterial).opacity,
      };
    },
    /** Render-state metadata a body check needs (shared with info-panel path). */
    bodyMeta: (id: string) => {
      const b = solar.bodies.get(id);
      if (!b) return null;
      const p = b.group.position;
      return {
        type: b.data.type,
        parentId: b.data.parentId ?? null,
        inclinationDeg: b.data.inclinationDeg ?? 0,
        semiMajorAxis: b.data.semiMajorAxis ?? 0,
        eccentricity: b.data.eccentricity ?? 0,
        renderRadius: +b.renderRadius.toFixed(4),
        // FULL precision: apoapsis-capped moons sit EXACTLY at the 9×(×2.2)
        // ceiling and the band check compares against parentRenderRadius×9 —
        // rounding here would spuriously fail vertices that are on the cap.
        parentRenderRadius: b.parentRenderRadius,
        moonRange: b.moonDistanceRange
          ? `${b.moonDistanceRange.minKm}-${b.moonDistanceRange.maxKm}`
          : null,
        // Parent-local for moons, scene-space otherwise (line lives in the
        // same container, so the comparison is space-consistent).
        local: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)],
      };
    },
    report,
    /** All live body ids (orbit-shape check enumerates moons dynamically). */
    bodyIds: () => [...solar.bodies.keys()],
    starFieldVisible: () => {
      let v = false;
      scene.traverse((o) => {
        if ((o as THREE.Points).isPoints) v = o.visible;
      });
      return v;
    },
  };
  (window as unknown as { __qwVerify?: typeof api }).__qwVerify = api;

  if (new URLSearchParams(location.search).get("autotest") === "1") {
    const log = (tag: string, extra: Record<string, unknown> = {}) =>
      console.log("QWVERIFY", JSON.stringify({ tag, ...api.report(), ...extra }));
    // Deterministic sweep: advance simulation time explicitly, then switch
    // modes; refreshScales() recomputes immediately so this verifies the
    // mapping regardless of headless rAF throttling.
    const T = 1250; // sim days — distinct planets at distinct anomalies
    const steps: [number, () => void][] = [
      [200, () => { api.setSimDays(T); log("t_log_enhanced"); }],
      [400, () => api.setSizeMode("relative")],
      [500, () => { api.setSimDays(T); log("t_size_relative"); }],
      [600, () => api.setSizeMode("uniform")],
      [700, () => { api.setSimDays(T); log("t_size_uniform"); }],
      [800, () => api.setSizeMode("enhanced")],
      [900, () => api.setDistanceMode("linear")],
      [1000, () => { api.setSimDays(T); log("t_dist_linear"); }],
      [1100, () => api.select("jupiter")],
      [1200, () => api.setDistanceMode("focus")],
      [1300, () => { api.setSimDays(T); log("t_focus_jupiter", { anchor: "jupiter" }); }],
      [1400, () => api.select(null)],
      [1500, () => api.setDistanceMode("log")],
      [1600, () => { api.setSimDays(T); log("t_back_global"); }],
      [1700, () => { api.select("saturn"); api.setSimDays(T + 40); log("t_focus_saturn_motion", { anchor: "saturn" }); }],
      // Transport contract (spec §8): speed change + pause freeze + reset.
      [1750, () => { api.setTimeScale(100); api.setPlaying(false); }],
      [1850, () => log("t_clock_paused_a", { clock: api.clockState() })],
      [1950, () => log("t_clock_paused_b", { clock: api.clockState() })],
      [2050, () => { api.resetClock(); api.setPlaying(true); log("t_clock_reset", { clock: api.clockState() }); }],
      // Camera focus contract (t_31402ac4). Tween = 1.0 s real; every settle
      // check waits >1 s after the (re)start, headless rAF included.
      [2100, () => api.select("mars")],
      [3400, () => log("t_cam_mars_settled", { cam: api.cameraState() })],
      // Moving target: reselect, then time-travel WHILE the tween runs —
      // target + camera must land on the body's CURRENT world position.
      [3500, () => api.select("saturn")],
      [3550, () => api.setSimDays(T + 120)],
      [4900, () => log("t_cam_saturn_motion", { cam: api.cameraState() })],
      // Moon focus: frames the PARENT-LOCAL system (io → Jupiter's moon ring).
      [5000, () => api.select("io")],
      [6400, () => log("t_cam_io_settled", { cam: api.cameraState() })],
      // Rapid consecutive re-selects mid-flight: safe cancel, no jump/NaN —
      // final state must still converge on Earth.
      [6500, () => api.select("ganymede")],
      [6560, () => api.select("callisto")],
      [6620, () => api.select("earth")],
      [7900, () => log("t_cam_reselect_chain", { cam: api.cameraState() })],
      // Distance-mode focus entry goes through the SAME camera path.
      [8000, () => api.setDistanceMode("focus")],
      [9400, () => log("t_cam_focus_mode", { cam: api.cameraState() })],
      [9500, () => api.select(null)],
      [10900, () => log("t_cam_global_back", { cam: api.cameraState() })],
    ];
    if (new URLSearchParams(location.search).get("moondump") === "1") {
      const dump: Record<string, string | number> = {};
      for (const [id, b] of solar.bodies) {
        if (b.data.type !== "moon") continue;
        const p = b.group.position;
        dump[id] = +Math.hypot(p.x, p.y, p.z).toFixed(2);
        dump[id + "_pr"] = +b.parentRenderRadius.toFixed(3);
        dump[id + "_range"] = b.moonDistanceRange
          ? `${b.moonDistanceRange.minKm}-${b.moonDistanceRange.maxKm}`
          : "null";
      }
      console.log("QWMOON", JSON.stringify(dump));
    }
    for (const [t, fn] of steps) setTimeout(fn, t);
  }
}
