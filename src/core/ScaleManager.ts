/**
 * ScaleManager — the single place that converts REAL astronomical values into
 * RENDER units. Render values must never be confused with real data (spec §1,
 * §4, §5, §6, §13, §15). All formulas are documented in the README.
 *
 * Three distance modes (spec §4):
 *  - log    (default): d = min + log1p(AU)/log1p(maxAU) · (max − min)
 *  - linear          : d = AU · linearUnitsPerAU (inner crowding is the point)
 *  - focus           : local scale centred on the selected planetary system —
 *                      the anchor sits near the origin and every other body
 *                      is placed by its REAL offset from the anchor (AU),
 *                      gently compressed. All relative motion stays visible.
 *
 * Three size modes (spec §6): enhanced (√-compressed, default), relative
 * (linear-ratio emphasis), uniform (fixed markers).
 */
import * as THREE from "three";
import {
  SOLAR_SYSTEM,
  getBodyById,
  maxHeliocentricDistanceAU,
  type CelestialBodyData,
} from "../data/solarSystemData";
import { ellipsePlanePosition } from "./Kepler";
import { systemParentOf } from "./bodyIdentity";

export type DistanceMode = "log" | "linear" | "focus";
export type SizeMode = "enhanced" | "relative" | "uniform";

export interface ScaleConfig {
  /** Pluto-scale maximum AU used by log mapping (spec §4). */
  maxDistanceAU: number;
  minRenderDistance: number;
  maxRenderDistance: number;
  /** Linear-mode AU→unit factor (world is huge here; inner planets crowd). */
  linearUnitsPerAU: number;
  sunRenderRadius: number;
  /** Focus mode: near-linear render units per AU of anchor-relative offset. */
  focusUnitsPerAU: number;
  /** Focus mode: log compression ceiling for anchor-relative offsets. */
  focusMaxRender: number;
  /** Radius boost for the selected body's parent planet (spec §5/§13). */
  systemRadiusBoost: number;
  /** Extra outer-ring scale for the selected system's moon orbits (spec §13). */
  systemMoonBoost: number;
}

export const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  maxDistanceAU: 39.6, // largest stored planetary a (Pluto, JPL SBDB)
  minRenderDistance: 16,
  maxRenderDistance: 190,
  linearUnitsPerAU: 4.7, // Neptune ≈ 141 units in linear mode
  sunRenderRadius: 8,
  focusUnitsPerAU: 26, // Mercury–Sun 0.39 AU ≈ 10 units; gentle log above ~1 AU
  focusMaxRender: 300,
  systemRadiusBoost: 1.35,
  systemMoonBoost: 2.2,
};

const EARTH_R = 6371.0084; // Earth mean radius km (JPL [S1])

/**
 * Deterministic per-body phase offset so bodies start at varied true
 * anomalies without inventing astronomical values (visual metadata only).
 */
export function bodyPhaseRad(index: number): number {
  return (index * 2.39996323) % (Math.PI * 2); // golden-angle spread
}

export interface PlanePoint {
  /** AU (or km for moons) along periapsis direction. */
  x: number;
  /** AU (or km) perpendicular in the orbital plane. */
  y: number;
  /** Real radius from the focus, same unit as x/y. */
  r: number;
}

export class ScaleManager {
  distanceMode: DistanceMode = "log";
  sizeMode: SizeMode = "enhanced";
  /** Selected body id — enlarges its local system (spec §5/§13). */
  selectedId: string | null = null;
  /**
   * Focus distance-mode anchor: a heliocentric body id (planet/dwarf/sun),
   * or null (Sun-centred, then focus mode behaves like a zoomed log view).
   */
  focusAnchorId: string | null = null;

  private readonly cfg: ScaleConfig;
  /** Largest real semi-major axis in the dataset (AU). */
  readonly maxAU: number;

  constructor(cfg: Partial<ScaleConfig> = {}) {
    this.cfg = { ...DEFAULT_SCALE_CONFIG, ...cfg };
    this.maxAU = Math.max(this.cfg.maxDistanceAU, maxHeliocentricDistanceAU());
  }

  /** True while a planet/dwarf system is enlarged (spec §13 detail view). */
  get systemBoostActive(): boolean {
    return this.selectedId !== null && this.selectedId !== "sun";
  }

  /**
   * One-shot mode switch used by the UI (spec §14) and tests. Focus mode is
   * always anchored: if nothing is selected, anchor on Earth (a useful
   * default inner-system view).
   */
  setMode(distance: DistanceMode, size: SizeMode): void {
    this.distanceMode = distance;
    this.sizeMode = size;
    if (distance === "focus" && !this.focusAnchorId) this.focusAnchorId = "earth";
  }

  /** Planet whose system is boosted — shared rule in core/bodyIdentity.ts. */
  private selectedParentId(): string | null {
    if (!this.selectedId) return null;
    const sel = getBodyById(this.selectedId);
    return sel ? systemParentOf(sel) : null;
  }

  /**
   * Radial log/linear mapping (spec §4). In focus mode this returns the
   * anchor-relative mapping instead, so callers that only know |r| degrade
   * gracefully; bodies with full plane coordinates use mapHeliocentricPoint.
   *   log:    d = min + log1p(AU)/log1p(maxAU) · (max − min)
   *   linear: d = AU · linearUnitsPerAU
   *   focus:  d = min(cap, log1p(40·AU) · 3)   (fallback, Sun-centred only)
   */
  mapHeliocentricDistance(distanceAU: number): number {
    const { minRenderDistance, maxRenderDistance, linearUnitsPerAU } = this.cfg;
    if (this.distanceMode === "linear") {
      return distanceAU * linearUnitsPerAU;
    }
    const normalized = Math.log1p(Math.max(0, distanceAU)) / Math.log1p(this.maxAU);
    return minRenderDistance + normalized * (maxRenderDistance - minRenderDistance);
  }

  /** True when heliocentric bodies must be placed relative to an anchor. */
  get focusActive(): boolean {
    return this.distanceMode === "focus" && this.focusAnchorId !== null && this.focusAnchorId !== "sun";
  }

  /**
   * Compressed anchor-relative offset (focus mode): near-linear for small
   * separations (inner planets stay distinguishable), log-capped far out so
   * the outer planets never fly off to thousands of units:
   *   off ≤ knee          : d = off · 0.75·focusUnitsPerAU
   *   off > knee          : d = min(cap, knee·lin + log1p(6(off−knee)) · 1.15·lin)
   */
  mapFocusOffset(offsetAU: number): number {
    const lin = this.cfg.focusUnitsPerAU * 0.75; // units per AU near the anchor
    const knee = 1.2; // AU where gentle log takes over
    if (offsetAU <= knee) return offsetAU * lin;
    return Math.min(
      this.cfg.focusMaxRender,
      knee * lin + Math.log1p((offsetAU - knee) * 6) * lin * 1.15,
    );
  }

  /**
   * Full 2D orbital-plane point (AU) → render-plane (x, cz) coords in the
   * scene's XZ plane, before inclination. Shared by CelestialBody position
   * and OrbitRenderer line so they agree exactly.
   */
  mapHeliocentricPlanePoint(
    p: PlanePoint,
    anchor: PlanePoint | null,
    out: { x: number; cz: number },
  ): { x: number; cz: number } {
    const theta = Math.atan2(p.y, p.x);
    if (!(this.focusActive && anchor)) {
      const d = this.mapHeliocentricDistance(p.r);
      out.x = d * Math.cos(theta);
      out.cz = d * Math.sin(theta);
      return out;
    }
    // Focus mode: position = anchor render position + compressed real offset.
    const aTheta = Math.atan2(anchor.y, anchor.x);
    const aD = this.mapHeliocentricDistance(anchor.r); // anchor pinned by radial map
    const ax = aD * Math.cos(aTheta);
    const acz = aD * Math.sin(aTheta);
    const offX = p.x - anchor.x;
    const offZ = p.y - anchor.y;
    const offR = Math.hypot(offX, offZ);
    const k = offR > 1e-9 ? this.mapFocusOffset(offR) / offR : 0;
    out.x = ax + offX * k;
    out.cz = acz + offZ * k;
    return out;
  }

  /** Apply inclination tilt about X: render-plane (x, cz) → scene vec3. */
  applyInclination(plane: { x: number; cz: number }, inclinationDeg: number, out: THREE.Vector3): THREE.Vector3 {
    const inc = THREE.MathUtils.degToRad(inclinationDeg);
    out.set(plane.x, plane.cz * Math.sin(inc), plane.cz * Math.cos(inc));
    return out;
  }

  /** Anchor's real heliocentric plane position (AU) at simDays. */
  anchorPlanePositionAU(simDays: number): PlanePoint | null {
    if (!this.focusActive || !this.focusAnchorId) return null;
    const anchor = getBodyById(this.focusAnchorId);
    if (!anchor) return null;
    const idx = SOLAR_SYSTEM.findIndex((b) => b.id === anchor.id);
    return ellipsePlanePosition(
      simDays,
      anchor.orbitalPeriodDays ?? 1,
      anchor.semiMajorAxis ?? 0,
      anchor.eccentricity ?? 0,
      bodyPhaseRad(Math.max(0, idx)),
    );
  }

  /**
   * Moon local-orbit mapping (spec §5): log1p over the shifted range inside a
   * planetary system, output 2.5×–9× of the parent's rendered radius. When the
   * system is selected, the outer ring doubles out for the detail view
   * (spec §13: "enlarge and clarify its local moon system").
   */
  mapSatelliteDistance(
    distanceKm: number,
    minDistanceKm: number,
    maxDistanceKm: number,
    parentRenderRadius: number,
  ): number {
    const minR = parentRenderRadius * 2.5;
    const maxR =
      parentRenderRadius * 9 * (this.systemBoostActive ? this.cfg.systemMoonBoost : 1);
    const shifted = Math.max(0, distanceKm - minDistanceKm);
    const shiftedMax = Math.max(1, maxDistanceKm - minDistanceKm);
    const normalized = Math.log1p(shifted) / Math.log1p(shiftedMax);
    return minR + normalized * (maxR - minR);
  }

  /**
   * Radius pair for camera focus (t_31402ac4): `raw` is the size-mode
   * mapping alone, `effective` is what the scene renders NOW (with the §13
   * boost when this body's system is selected). The camera frames
   * `effective`; `raw` documents the actual (pre-boost) size.
   */
  bodyRadiusPair(body: CelestialBodyData): { raw: number; effective: number } {
    const raw = this.mapBodyRadiusBase(body);
    const boosted =
      this.systemBoostActive && body.id === this.selectedParentId()
        ? raw * this.cfg.systemRadiusBoost
        : raw;
    return { raw, effective: boosted };
  }

  /** Rendered body radius under the active size mode (spec §6). */
  mapBodyRadius(body: CelestialBodyData): number {
    const r = this.mapBodyRadiusBase(body);
    // Spec §5/§13: enlarge the selected planet itself (its moons ride along
    // via parentRenderRadius).
    if (this.systemBoostActive && body.id === this.selectedParentId()) {
      return r * this.cfg.systemRadiusBoost;
    }
    return r;
  }

  /** Size-mode radius WITHOUT the selection boost (base mapping). */
  mapBodyRadiusBase(body: CelestialBodyData): number {
    const ratio = body.radiusKm / EARTH_R;

    if (body.type === "star") return this.cfg.sunRenderRadius;

    let r: number;
    switch (this.sizeMode) {
      case "uniform":
        r = 0.6;
        break;
      case "relative":
        // Stronger emphasis on true ratios, still clamped for visibility.
        r = THREE.MathUtils.clamp(0.25 + 0.35 * ratio, 0.25, 6.5);
        break;
      case "enhanced":
      default:
        r =
          body.type === "moon"
            ? THREE.MathUtils.clamp(0.16 + 0.4 * Math.sqrt(ratio), 0.16, 0.75)
            : THREE.MathUtils.clamp(0.55 + 0.65 * Math.sqrt(ratio), 0.55, 4.0);
    }

    return r;
  }

  /** Current scale-mode explanation for UI/tooltip (spec §4, §10). */
  get scaleMode(): string {
    return this.distanceModeLabelKo();
  }

  distanceModeLabelKo(): string {
    if (this.distanceMode === "log") return "로그 거리 스케일 (log scale)";
    if (this.distanceMode === "linear") return "선형 거리 스케일 (linear scale)";
    const anchor = this.focusAnchorId ? getBodyById(this.focusAnchorId) : undefined;
    return anchor
      ? `포커스 스케일 — ${anchor.nameKo} 중심 (focus scale)`
      : "포커스 스케일 — 태양 중심";
  }

  sizeModeLabelKo(): string {
    return this.sizeMode === "enhanced"
      ? "가시성 향상 크기 (enhanced)"
      : this.sizeMode === "relative"
        ? "상대 크기 강조 (relative)"
        : "균일 마커 (uniform)";
  }

  /** Helper for info panels: current render radius of a body. */
  renderedRadiusOf(bodyId: string): number | undefined {
    const body = SOLAR_SYSTEM.find((b) => b.id === bodyId);
    return body ? this.mapBodyRadius(body) : undefined;
  }

  /**
   * Current rendered orbital distance (units) of a body under the ACTIVE
   * distance mode — exactly what the scene shows (spec §10: the info panel
   * must agree with the picture). Heliocentric bodies measure from the Sun
   * (or from the focus anchor, and the label says so); moons measure from
   * their parent in the parent-local system.
   */
  renderedDistanceOf(
    bodyId: string,
    simDays: number,
    moonRange: { minKm: number; maxKm: number } | null,
    parentRenderRadius: number,
  ): { units: number; fromLabelKo: string } | undefined {
    const body = SOLAR_SYSTEM.find((b) => b.id === bodyId);
    if (!body) return undefined;
    if (body.type === "star") return { units: 0, fromLabelKo: "—" };
    if (body.type === "moon") {
      const p = ellipseOf(body, simDays); // km units for moons
      const range = moonRange ?? { minKm: p.x, maxKm: Math.abs(p.x) + 1 };
      return {
        units: this.mapSatelliteDistance(p.r, range.minKm, range.maxKm, parentRenderRadius),
        fromLabelKo: `${getBodyById(body.parentId ?? "")?.nameKo ?? "?"} 기준 (parent-local)`,
      };
    }
    const p = ellipseOf(body, simDays);
    const out = { x: 0, cz: 0 };
    this.mapHeliocentricPlanePoint(p, this.anchorPlanePositionAU(simDays), out);
    const from = this.focusActive
      ? `기준 ${getBodyById(this.focusAnchorId ?? "")?.nameKo ?? "?"} (focus)`
      : "태양 기준";
    return { units: Math.hypot(out.x, out.cz), fromLabelKo: from };
  }
}

/** Real plane position (AU) of a heliocentric body at simDays (shared helper). */
export function ellipseOf(body: CelestialBodyData, simDays: number): PlanePoint {
  const idx = SOLAR_SYSTEM.findIndex((b) => b.id === body.id);
  return ellipsePlanePosition(
    simDays,
    body.orbitalPeriodDays ?? 1,
    body.semiMajorAxis ?? 0,
    body.eccentricity ?? 0,
    bodyPhaseRad(Math.max(0, idx)),
  );
}
