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
import { InfoPanel } from "./ui/InfoPanel";
import { ControlPanel } from "./ui/ControlPanel";
import { Labels } from "./ui/Labels";
import { OverlayManager } from "./ui/OverlayManager";
import { BODY_SELECTED_EVENT } from "./ui/overlayState";

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

// --- camera focus tween (ease-in-out, spec §9) -------------------------------
interface Tween {
  fromPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromTarget: THREE.Vector3;
  dist: number;
  t: number;
}
let tween: Tween | null = null;
/** Tween duration in REAL seconds (frame-rate independent, spec §8/§16). */
const CAMERA_TWEEN_SECONDS = 1.0;

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function focusOn(id: string | null): void {
  selectedId = id;
  scale.selectedId = id;
  // Focus distance mode anchors on the selected planet/dwarf (spec §4/§13);
  // selecting a moon anchors on its parent so the whole system stays centred.
  const sel = id ? getBodyById(id) : undefined;
  const anchorId = sel && sel.type !== "star" ? (sel.type === "moon" ? sel.parentId ?? sel.id : sel.id) : null;
  scale.focusAnchorId = anchorId;
  solar.setSystemRevealed(id);
  solar.animateScaleChange();
  for (const [bid, orbit] of solar.orbits) {
    orbit.setHighlighted(bid === id);
  }
  const worldTarget = new THREE.Vector3();
  let dist = 340;
  if (!id) {
    worldTarget.set(0, 0, 0);
  } else {
    const body = solar.bodies.get(id);
    if (!body) return;
    body.group.getWorldPosition(worldTarget);
    dist = Math.max(body.renderRadius * 6, 6);
    const systemKey = body.data.type === "moon" ? body.data.parentId : body.data.id;
    if (systemKey) {
      const maxR = Math.max(
        1,
        ...[...solar.bodies.values()]
          .filter((b) => b.data.type === "moon" && b.data.parentId === systemKey)
          .map((b) => b.moonRenderDistance(b.data.semiMajorAxis ?? 0, scale)),
      );
      dist = Math.max(dist, maxR * 2.6, body.renderRadius * 5);
    }
  }
  tween = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: worldTarget,
    dist,
    t: 0,
  };
}

// --- picking (spec §10) ------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pick(ev: { clientX: number; clientY: number }): string | null {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(solar.pickTargets(), false);
  for (const h of hits) {
    const id = h.object.userData.bodyId;
    if (typeof id === "string") return id;
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

let downX = 0, downY = 0;
renderer.domElement.addEventListener("pointerdown", (ev) => {
  downX = ev.clientX;
  downY = ev.clientY;
});
renderer.domElement.addEventListener("pointerup", (ev) => {
  if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return; // drag, not click
  const id = pick(ev);
  if (id) selectBody(id);
});
renderer.domElement.addEventListener("dblclick", (ev) => {
  if (!pick(ev)) {
    focusOn(null);
    info.hide();
  }
});
renderer.domElement.addEventListener("pointermove", (ev) => {
  const id = pick(ev);
  if (id) {
    const b = getBodyById(id);
    if (b) info.showTooltip(ev.clientX, ev.clientY, b);
    renderer.domElement.style.cursor = "pointer";
  } else {
    info.hideTooltip();
    renderer.domElement.style.cursor = "default";
  }
});

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
window.addEventListener("beforeunload", () => {
  solar.dispose();
  renderer.dispose();
});

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
  requestAnimationFrame(frame);

// --- optional interaction-free test API (verification builds only) ----------
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
    },
    setSizeMode: (m: "enhanced" | "relative" | "uniform") => {
      scale.sizeMode = m;
      solar.animateScaleChange();
    },
    select: (id: string | null) => {
      focusOn(id);
      if (id) info.showBody(id);
      else info.hide();
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
    report,
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
