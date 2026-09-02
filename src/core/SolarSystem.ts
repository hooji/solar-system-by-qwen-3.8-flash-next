/**
 * SolarSystem — scene-graph assembly. Owns CelestialBody + OrbitRenderer
 * instances, the Sun light, star field, rings and textures. Every body with
 * a real photographic surface map (data/bodyTextures.ts — NASA imagery,
 * bundled under textures/) loads it asynchronously; the procedural look
 * below doubles as the instant placeholder and the no-network fallback.
 * Handles scale-mode CHANGES as smooth interpolations (spec §13: never
 * switch abruptly) and the detail-view reveal for the selected system.
 * No UI logic here (spec §17 separation).
 */
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  SOLAR_SYSTEM,
  getBodyById,
  getChildrenOf,
  type CelestialBodyData,
} from "../data/solarSystemData";
import { CelestialBody, disposeSharedGeometries } from "./CelestialBody";
import { OrbitRenderer } from "./OrbitRenderer";
import { systemParentOf } from "./bodyIdentity";
import type { ScaleManager } from "./ScaleManager";
import { BODY_TEXTURE_FILES, RING_TEXTURE_FILES } from "../data/bodyTextures";
import { loadColorTexture } from "./textures";
import {
  bvToRGB,
  equatorialToSceneDirection,
  loadStarCatalog,
} from "../data/starCatalog";

/** Seconds over which scale-mode / system changes are interpolated. */
const TRANSITION_SECONDS = 0.7;

/**
 * Soft round point sprite for stars — THREE.Points rasterises square
 * pixels, which reads as boxes at the bright buckets' 3+ px sizes; a
 * radial-falloff sprite turns every star into a round, softly-glowing dot.
 */
function makeStarSprite(): THREE.CanvasTexture | null {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Procedural banded CanvasTexture — placeholder until the photo map loads. */
function makeBandedTexture(base: string, bandColor: string): THREE.CanvasTexture | null {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = bandColor;
  for (let y = 0; y < size; y += 8) {
    const h = 2 + Math.abs(Math.sin(y * 0.35) * 5);
    ctx.globalAlpha = 0.18 + 0.12 * Math.abs(Math.cos(y * 0.2));
    ctx.fillRect(0, y, size, h);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Blue-green marble tone for Earth, procedural (spec §12 recognisability). */
function makeEarthTexture(): THREE.CanvasTexture | null {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#1c4f8b";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#3f7a3a";
  // simple deterministic "continents"
  for (let i = 0; i < 14; i++) {
    const x = (i * 71) % size;
    const y = (i * 47 + 20) % size;
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + (i % 5) * 6, 9 + (i % 3) * 5, i * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 53 + 15) % size, (i * 97) % size, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SolarSystem {
  readonly root = new THREE.Group();
  readonly bodies = new Map<string, CelestialBody>();
  readonly orbits = new Map<string, OrbitRenderer>();
  readonly labelObjects = new Map<string, CSS2DObject>();

  /** Real-sky star field: one THREE.Points per magnitude bucket. */
  private starField: THREE.Group | null = null;
  private readonly disposables: { dispose(): void }[] = [];
  /** Ring meshes — extra raycast pick targets (userData.bodyId = planet id). */
  private readonly ringMeshes: THREE.Mesh[] = [];

  /** Smooth scale-change state (spec §13): blend prev→cur render positions. */
  private transitionT = 1;
  private readonly prevPositions = new Map<string, THREE.Vector3>();
  private readonly prevRadii = new Map<string, number>();
  /** Scratch — no per-frame allocation (spec §16). */
  private readonly tmpPos = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly scale: ScaleManager,
  ) {
    this.build();
  }

  private build(): void {
    // Ambient + Sun point light (spec §12).
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const sunLight = new THREE.PointLight(0xfff2cc, 3.2, 0, 0.00085);
    sunLight.position.set(0, 0, 0);
    this.root.add(sunLight);

    SOLAR_SYSTEM.forEach((data, idx) => {
      const body = new CelestialBody(data, idx);

      if (data.render?.banded) {
        const tex = data.id === "earth"
          ? makeEarthTexture()
          : makeBandedTexture(data.displayColor, data.id === "saturn" || data.id === "jupiter" ? "#2a2018" : "#101820");
        if (tex) {
          const mat = body.mesh.material as THREE.MeshStandardMaterial;
          mat.map = tex;
          mat.needsUpdate = true;
          this.disposables.push(tex);
        }
      }

      // Real photographic surface map (NASA imagery, data/bodyTextures.ts):
      // async — the procedural look above is the instant placeholder and
      // stays if the file is missing or unreachable.
      const photo = BODY_TEXTURE_FILES[data.id];
      if (photo) {
        loadColorTexture(photo, (tex) => {
          body.applyTexture(tex);
          this.disposables.push(tex);
        });
      }

      // Saturn (mandatory) / Uranus (thin, spec §12) rings.
      if (data.render?.hasRings) {
        const ring = this.makeRing(data);
        if (ring) {
          body.tiltGroup.add(ring);
          this.ringMeshes.push(ring);
        }
      }

      // Moons live under the parent's group → whole system travels with it.
      if (data.type === "moon" && data.parentId) {
        const parent = this.bodies.get(data.parentId);
        if (parent) parent.group.add(body.group);
        else this.root.add(body.group);
      } else {
        this.root.add(body.group);
      }
      this.bodies.set(data.id, body);
    });

    // Ring radii depend on each parent's render radius — applied in refreshScales().
    this.computeMoonRanges();

    // Heliocentric + moon orbit lines.
    for (const body of this.bodies.values()) {
      const d = body.data;
      if (d.type === "star") continue;
      const orbit = new OrbitRenderer(d);
      const parentGroup =
        d.type === "moon" && d.parentId ? this.bodies.get(d.parentId)?.group ?? this.root : this.root;
      parentGroup.add(orbit.line);
      this.orbits.set(d.id, orbit);
    }

    this.scene.add(this.root);
    this.starField = this.makeStarField();
    if (this.starField) this.scene.add(this.starField);

    this.setSystemRevealed(null);
  }

  private makeRing(data: CelestialBodyData): THREE.Mesh | null {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    if (data.id === "uranus") {
      grad.addColorStop(0, "rgba(170,210,215,0.02)");
      grad.addColorStop(0.5, "rgba(190,225,230,0.28)");
      grad.addColorStop(1, "rgba(160,200,210,0.04)");
    } else {
      grad.addColorStop(0, "rgba(210,190,150,0.05)");
      grad.addColorStop(0.5, "rgba(230,210,170,0.55)");
      grad.addColorStop(1, "rgba(190,170,140,0.08)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const inner = data.render?.ringInnerScale ?? 1.3;
    const outer = data.render?.ringOuterScale ?? 2.2;
    const geo = new THREE.RingGeometry(inner, outer, 96);
    // Remap UV so the gradient spans inner→outer radially.
    const pos = geo.getAttribute("position");
    const uv = geo.getAttribute("uv");
    const v3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      const rr = (v3.length() - inner) / (outer - inner);
      uv.setXY(i, rr, 0.5);
    }
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: data.id === "uranus" ? 0.35 : 0.85,
      depthWrite: false,
    });
    // Real ring strip (Cassini-derived, alpha = gaps) where one exists; the
    // radial UV above (u = inner→outer) matches the strip's horizontal axis.
    const ringPhoto = RING_TEXTURE_FILES[data.id];
    if (ringPhoto) {
      loadColorTexture(ringPhoto, (rtex) => {
        mat.map = rtex;
        mat.opacity = 1;
        mat.needsUpdate = true;
        this.disposables.push(rtex);
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2; // lies in the planet's equatorial (XZ) plane
    mesh.name = `ring:${data.id}`;
    // Ring clicks resolve to the owning planet (bodyIdentity parent-chain rule).
    mesh.userData.bodyId = data.id;
    this.disposables.push(geo, mat, tex);
    return mesh;
  }

  /**
   * The REAL night sky: every naked-eye star of the Yale Bright Star
   * Catalogue at its true J2000 position, rotated onto the ecliptic frame
   * the planets already use (scene XZ = ecliptic, +Y = north ecliptic
   * pole, +X = vernal equinox; orientation-preserving, so constellations
   * read correctly from inside — data/starCatalog.ts owns the math).
   * Brightness follows V magnitude through size/opacity buckets (one
   * THREE.Points per bucket keeps plain PointsMaterial — no custom
   * shader); per-vertex color follows the B−V index. Mobile keeps only
   * mag ≤ 5.5 (~2.9k stars, spec §16); note the planets' orbital PHASES
   * are synthetic, so star-vs-planet alignment carries no epoch meaning —
   * the frame orientation is what is astronomically faithful here.
   */
  private makeStarField(): THREE.Group {
    // Outside the camera envelope (controls.maxDistance 1500), well inside
    // the far plane (6000): the viewer is always inside the celestial sphere.
    const RADIUS = 2500;
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const magLimit = isMobile ? 5.5 : Infinity;
    const cat = loadStarCatalog();

    // [max Vmag, point size px, opacity] — brighter bucket: bigger, denser.
    const BUCKETS: [number, number, number][] = [
      [0.5, 3.6, 1.0],
      [1.5, 3.0, 0.95],
      [2.5, 2.4, 0.9],
      [3.5, 1.9, 0.8],
      [4.5, 1.5, 0.65],
      [5.5, 1.2, 0.5],
      [Infinity, 1.0, 0.38],
    ];
    const positions: number[][] = BUCKETS.map(() => []);
    const colors: number[][] = BUCKETS.map(() => []);
    const dir = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < cat.count; i++) {
      const mag = cat.mag[i] ?? 99;
      if (mag > magLimit) continue;
      const bucket = BUCKETS.findIndex(([maxMag]) => mag <= maxMag);
      equatorialToSceneDirection(cat.raDeg[i] ?? 0, cat.decDeg[i] ?? 0, dir);
      positions[bucket]?.push(dir.x * RADIUS, dir.y * RADIUS, dir.z * RADIUS);
      const [r, g, b] = bvToRGB(cat.bv[i] ?? 0.4);
      colors[bucket]?.push(r, g, b);
    }

    const group = new THREE.Group();
    group.name = "starfield";
    const sprite = makeStarSprite();
    if (sprite) this.disposables.push(sprite);
    BUCKETS.forEach(([, size, opacity], idx) => {
      const pos = positions[idx];
      const col = colors[idx];
      if (!pos || pos.length === 0 || !col) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size: sprite ? size * 1.6 : size, // sprite falloff eats the edge
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        ...(sprite ? { map: sprite } : {}),
      });
      this.disposables.push(geo, mat);
      group.add(new THREE.Points(geo, mat));
    });
    return group;
  }

  /** Min/max real moon orbit distance (km) per parent — drives local log map. */
  private computeMoonRanges(): void {
    for (const body of this.bodies.values()) {
      const d = body.data;
      if (d.type !== "moon" || !d.parentId) continue;
      const sibs = getChildrenOf(d.parentId);
      // Range must cover the FULL radial span, not just the semi-major axes:
      // an eccentric orbit's r reaches a(1+e) at apoapsis, and single-moon
      // systems (e.g. Moon, Triton) would otherwise have min==max and blow
      // past the 2.5×–9× band (log1p overshoot).
      const loVals = sibs.map((s) => (s.semiMajorAxis ?? 0) * (1 - (s.eccentricity ?? 0)));
      const hiVals = sibs.map((s) => (s.semiMajorAxis ?? 0) * (1 + (s.eccentricity ?? 0)));
      const range = { minKm: Math.min(...loVals), maxKm: Math.max(...hiVals) };
      for (const s of sibs) {
        const cb = this.bodies.get(s.id);
        if (cb) cb.moonDistanceRange = range;
      }
    }
  }

  /**
   * Begin an eased transition: capture current render positions/radii as the
   * "from" state; update() then interpolates to the new mapping over
   * TRANSITION_SECONDS (spec §13: interpolate scale changes, never snap).
   */
  beginTransition(): void {
    this.prevPositions.clear();
    this.prevRadii.clear();
    for (const [id, b] of this.bodies) {
      this.prevPositions.set(id, b.group.position.clone());
      this.prevRadii.set(id, b.renderRadius);
    }
    this.transitionT = 0;
    this.refreshOrbits(); // orbit LINES move to the new mapping immediately
  }

  /** Re-apply current scales with a smooth transition (mode change entry). */
  animateScaleChange(): void {
    this.beginTransition();
  }

  /**
   * Detail-view reveal (spec §13): selected planet's moon orbit lines become
   * clear, other systems' moon lines stay hidden-ish. selectedId=null opens
   * the global view.
   */
  setSystemRevealed(selectedId: string | null): void {
    // Moon → parent, planet → itself, star/none → null: the SAME rule the
    // camera-focus layer uses (core/bodyIdentity.ts, task t_766b495f).
    const data = selectedId
      ? (this.bodies.get(selectedId)?.data ?? getBodyById(selectedId))
      : undefined;
    const parentSel = data ? systemParentOf(data) : null;
    for (const [id, orbit] of this.orbits) {
      const d = this.bodies.get(id)?.data;
      if (!d) continue;
      orbit.setSystemRevealed(d.type === "moon" && d.parentId === parentSel);
    }
    // Spec §13 detail view: dim unrelated planets/moons, keep the selected
    // system (and, in the global view, everything) at full brightness.
    for (const body of this.bodies.values()) {
      const d = body.data;
      const related =
        parentSel === null ||
        d.id === parentSel ||
        (d.type === "moon" && d.parentId === parentSel);
      body.setDimmed(!related);
    }
    this.refreshOrbits(); // moon ring widths follow the system boost
  }

  /** Rebuild orbit lines from the active scale mode (buffers reused). */
  private refreshOrbits(): void {
    const anchor = this.scale.anchorPlanePositionAU(this.lastSimDays);
    for (const [id, orbit] of this.orbits) {
      const body = this.bodies.get(id);
      if (!body) continue;
      const parentR = body.data.type === "moon" ? body.parentRenderRadius : 0;
      orbit.refresh(this.scale, parentR, body.moonDistanceRange, anchor);
    }
  }

  /** Immediate re-map (no transition): used at init and by the sim-time task. */
  refreshScales(simDays: number): void {
    this.transitionT = 1;
    this.syncParentRadii();
    this.update(simDays, 1);
    this.refreshOrbits();
  }

  private lastSimDays = 0;
  /** Moons map distances from parentRenderRadius — update it first. */
  private syncParentRadii(): void {
    for (const body of this.bodies.values()) {
      if (body.data.type !== "moon") continue;
      const parent = body.data.parentId ? this.bodies.get(body.data.parentId) : undefined;
      if (parent) body.parentRenderRadius = parent.renderRadius || scaleRadiusOf(parent, this.scale);
    }
  }

  /**
   * Per-frame update: positions from accumulated simDays (spec §7/§8) —
   * purely sim-time driven, so identical at any frame rate. `dtSec` is REAL
   * seconds since last frame (clamped by the caller) and drives ONLY the
   * scale-change transition blend (spec §13/§16: no 60fps assumption).
   */
  update(simDays: number, dtSec = 1 / 60): void {
    this.lastSimDays = simDays;
    const anchor = this.scale.anchorPlanePositionAU(simDays);
    if (this.transitionT < 1) {
      this.transitionT = Math.min(1, this.transitionT + dtSec / TRANSITION_SECONDS);
    }
    const k = easeInOut(this.transitionT);

    this.syncParentRadii();
    for (const body of this.bodies.values()) {
      body.updateFromSim(simDays, this.scale, anchor);
      if (k < 1) {
        // Interpolate from the captured pre-change state (spec §13).
        const from = this.prevPositions.get(body.data.id);
        if (from) {
          this.tmpPos.copy(body.group.position); // target written by updateFromSim
          body.group.position.lerpVectors(from, this.tmpPos, k);
        }
        const rFrom = this.prevRadii.get(body.data.id);
        if (rFrom !== undefined && rFrom > 0) {
          const r = THREE.MathUtils.lerp(rFrom, body.renderRadius, k);
          body.mesh.scale.setScalar(r);
        }
      }
    }
    if (this.transitionT >= 1) {
      this.prevPositions.clear();
      this.prevRadii.clear();
    }
    this.syncRings();
    // Focus-mode anchor moves each frame → lines must follow (signature-gated
    // internally, so this is cheap in log/linear modes).
    this.refreshOrbits();
  }

  /** Keep ring geometry at planet render scale (unit-space rings). */
  private syncRings(): void {
    for (const body of this.bodies.values()) {
      if (!body.data.render?.hasRings) continue;
      const ring = body.group.getObjectByName(`ring:${body.data.id}`);
      if (ring) ring.scale.setScalar(body.renderRadius);
    }
  }

  setStarFieldVisible(visible: boolean): void {
    if (!this.starField) return;
    this.starField.visible = visible;
    // Also stamp each magnitude-bucket Points: verification probes read
    // Points.visible directly (main.ts VITE_VERIFY starsVisible).
    for (const child of this.starField.children) child.visible = visible;
  }

  setOrbitsVisible(visible: boolean): void {
    for (const o of this.orbits.values()) o.setVisible(visible);
  }

  /**
   * Pick targets for the raycaster: every body mesh PLUS ring meshes (rings
   * hang under the tiltGroup, not the mesh, so they'd be unreachable
   * otherwise). Every target carries userData.bodyId (rings: the owning
   * planet), so resolveBodyIdFromObject maps any hit to the real body root.
   */
  pickTargets(): THREE.Object3D[] {
    return [...this.bodies.values()].map((b) => b.mesh).concat(this.ringMeshes);
  }

  dispose(): void {
    for (const o of this.orbits.values()) o.dispose();
    for (const b of this.bodies.values()) b.dispose();
    disposeSharedGeometries(); // owned by the scene builder, freed once here
    for (const d of this.disposables) d.dispose();
    this.scene.remove(this.root);
    if (this.starField) this.scene.remove(this.starField);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function scaleRadiusOf(body: CelestialBody, scale: ScaleManager): number {
  return scale.mapBodyRadius(body.data);
}
