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

// --- state ------------------------------------------------------------------
const scale = new ScaleManager();
const clock = new SimulationClock();
const solar = new SolarSystem(scene, scale);
const labels = new Labels();
labels.attach(solar);

let selectedId: string | null = null;
let focusModeCenter = new THREE.Vector3(); // used by 'focus' distance mode

const info = new InfoPanel(viewport, scale, (b) => {
  const body = solar.bodies.get(b.id);
  const r = body?.renderRadius ?? 0;
  const dist =
    b.type === "star"
      ? 0
      : b.type === "moon" && body
        ? body.moonRenderDistance(b.semiMajorAxis ?? 0, scale)
        : scale.mapHeliocentricDistance(b.semiMajorAxis ?? 0);
  return { distance: dist, radius: r };
});

// Header + disclaimer (spec §14).
const header = document.createElement("header");
header.className = "panel header";
header.innerHTML =
  "<h1>로그 태양계 · Logarithmic Solar System</h1>" +
  '<p class="sub">실제 천문 데이터를 로그 스케일로 압축한 시각화입니다.</p>';
viewport.appendChild(header);

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

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function focusOn(id: string | null): void {
  selectedId = id;
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
    if (body.data.type === "moon" || body.data.type === "planet" || body.data.type === "dwarf-planet") {
      const systemKey = body.data.type === "moon" ? body.data.parentId : body.data.id;
      const maxR = Math.max(
        1,
        ...[...solar.bodies.values()]
          .filter((b) => b.data.type === "moon" && b.data.parentId === systemKey)
          .map((b) => b.moonRenderDistance(b.data.semiMajorAxis ?? 0, scale)),
      );
      dist = Math.max(dist, maxR * 2.6, body.renderRadius * 5);
    }
  }
  const dir = camera.position.clone().sub(controls.target).normalize();
  tween = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: worldTarget,
    dist,
    t: 0,
  };
  // keep current viewing direction, just move target + adjust distance
  tween.toTarget.addScaledVector(dir, 0); // target only; camera computed per frame
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

let downX = 0, downY = 0;
renderer.domElement.addEventListener("pointerdown", (ev) => {
  downX = ev.clientX;
  downY = ev.clientY;
});
renderer.domElement.addEventListener("pointerup", (ev) => {
  if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return; // drag, not click
  const id = pick(ev);
  if (id) {
    focusOn(id);
    info.showBody(id);
  }
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
new ControlPanel(viewport, {
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
    if (m === "focus" && selectedId) {
      solar.bodies.get(selectedId)?.group.getWorldPosition(focusModeCenter);
    } else {
      focusModeCenter.set(0, 0, 0);
    }
    solar.refreshScales(clock.simDays);
  },
  onSizeMode: (m) => {
    scale.sizeMode = m;
    solar.refreshScales(clock.simDays);
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
