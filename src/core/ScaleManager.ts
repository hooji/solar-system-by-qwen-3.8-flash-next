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
 * Five size modes (spec §6 + demo-UI magnification): enhanced (√-compressed),
 * huge (enhanced ×3, default — bigger targets are easier to read and click),
 * gigantic (enhanced ×10), relative (linear-ratio emphasis), uniform (fixed
 * markers). The Sun keeps its fixed render radius in every mode.
 */
import * as THREE from "three";
import {
  SOLAR_SYSTEM,
  getBodyById,
  maxHeliocentricDistanceAU,
  type CelestialBodyData,
} from "../data/solarSystemData";
import { t, type Lang } from "../ui/i18n";
import { bodyDisplayName } from "../ui/format";
import { ellipsePlanePosition } from "./Kepler";
import { systemParentOf } from "./bodyIdentity";

export type DistanceMode = "log" | "linear" | "focus";
export type SizeMode = "enhanced" | "relative" | "uniform" | "huge" | "gigantic";

/**
 * Magnification of the enhanced mapping per size mode (planets/dwarfs/moons
 * only — the Sun is excluded, or it would swallow the inner orbits).
 */
export const SIZE_MODE_MULTIPLIER: Readonly<Record<SizeMode, number>> = {
  enhanced: 1,
  relative: 1,
  uniform: 1,
  huge: 3,
  gigantic: 10,
};

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
  sizeMode: SizeMode = "huge";
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
   * True only for the SELECTED system's parent: the spec §13 moon-band boost
   * (×systemMoonBoost) applies to that one system. Selecting a planet must
   * never move ANOTHER planet's moons — the boost used to key on the global
   * systemBoostActive flag, so zooming into Mars visibly pushed Saturn's and
   * Jupiter's outer moons ×2.2 further out (the "stray dots near other
   * planets" artifact, amplified by the huge/gigantic sizes).
   */
  moonBoostActiveFor(parentId: string | undefined): boolean {
    return this.systemBoostActive && parentId !== undefined && parentId === this.selectedParentId();
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
   * Full 2D orbital-plane point (AU, Sun-centred) → render-plane (x, cz).
   * Shared by CelestialBody position AND OrbitRenderer lines so they agree
   * exactly in every mode (spec §4, §13).
   * - log/linear: radial map of |p| by its own angle.
   * - focus: the anchor sits at the SCENE ORIGIN (the selected system is the
   *   centre), and every body renders at compress(p − anchor) — the REAL
   *   anchor-relative offset, log-compressed. `anchor` = anchor's real
   *   position (AU); if null, falls back to radial mapping.
   */
  mapHeliocentricPlanePoint(
    p: PlanePoint,
    anchor: PlanePoint | null,
    out: { x: number; cz: number },
  ): { x: number; cz: number } {
    if (!(this.focusActive && anchor)) {
      const theta = Math.atan2(p.y, p.x);
      const d = this.mapHeliocentricDistance(p.r);
      out.x = d * Math.cos(theta);
      out.cz = d * Math.sin(theta);
      return out;
    }
    const offX = p.x - anchor.x;
    const offZ = p.y - anchor.y;
    const offR = Math.hypot(offX, offZ);
    const k = offR > 1e-9 ? this.mapFocusOffset(offR) / offR : 0;
    out.x = offX * k;
    out.cz = offZ * k;
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
   * Moon-orbit render band around a parent, from the parent's rendered
   * radius. The band is anchored to the parent's LAYOUT radius (the rendered
   * radius with the huge/gigantic magnification divided back out): the
   * magnification is a pure body-size zoom for visibility/clickability and
   * must not fling moons ×3/×10 further out (at ×3, Callisto would render
   * past Saturn's orbit). Two guards keep the band sane at high zoom: the
   * inner edge clears the parent's VISUAL surface (×1.4) and the outer edge
   * stays a real band (≥ ×1.7 of the inner edge). For the 1× modes
   * (enhanced/relative/uniform) this reduces exactly to the original
   * 2.5×–9× rule (× systemMoonBoost for the SELECTED system only —
   * moonBoostActiveFor; other systems' moons never move on selection).
   */
  private moonBand(
    parentRenderRadius: number,
    parentId: string | undefined,
  ): { minR: number; maxR: number } {
    const mult = SIZE_MODE_MULTIPLIER[this.sizeMode] ?? 1;
    const layoutR = parentRenderRadius / mult;
    const minR = Math.max(2.5 * layoutR, 1.4 * parentRenderRadius);
    const boosted =
      9 * layoutR * (this.moonBoostActiveFor(parentId) ? this.cfg.systemMoonBoost : 1);
    return { minR, maxR: Math.max(boosted, minR * 1.7) };
  }

  /**
   * Satellite SIZE mapping (spec §5): log1p over the shifted range inside a
   * planetary system, output across the moonBand() of the parent's rendered
   * radius (2.5×–9× of the parent in the 1× size modes). When the system is
   * selected, the outer ring doubles out for the detail view (spec §13:
   * "enlarge and clarify its local moon system").
   *
   * This maps an orbit's CHARACTERISTIC radius (its semi-major axis) — it is
   * NOT a per-vertex radius remap. Feeding r(θ) through it vertex-by-vertex
   * bent every moon orbit into a cardioid-family curve (t_5a546f13 diagnosis,
   * docs/orbit-shape-diagnosis.md): the log is grossly nonlinear over a
   * km-scale shifted range while θ stayed untouched. Draw orbits through
   * mapSatelliteOrbitRadius; this scalar form stays for size ordering and
   * camera framing (main.ts focusFrameFor system extent).
   */
  mapSatelliteDistance(
    distanceKm: number,
    minDistanceKm: number,
    maxDistanceKm: number,
    parentRenderRadius: number,
    parentId?: string,
  ): number {
    const { minR, maxR } = this.moonBand(parentRenderRadius, parentId);
    const shifted = Math.max(0, distanceKm - minDistanceKm);
    const shiftedMax = Math.max(1, maxDistanceKm - minDistanceKm);
    const normalized = Math.log1p(shifted) / Math.log1p(shiftedMax);
    return minR + normalized * (maxR - minR);
  }

  /**
   * Uniform render scale for ONE satellite orbit (render units per km).
   * Every radius of the orbit — at every angle θ — shares this single
   * constant, so the drawn curve is a mathematically SIMILAR ellipse: θ,
   * a:b = 1 : √(1−e²) and the eccentricity are preserved exactly (uniform
   * scaling about the focus maps a conic to the same-e conic). The orbit's
   * SIZE rides the log band via mapSatelliteDistance(a); the drawn apoapsis
   * is additionally capped at the band ceiling so no orbit exceeds 9×
   * (× systemMoonBoost while selected) even at large real e.
   * Shared by OrbitRenderer and CelestialBody — line ≡ body by construction.
   */
  satelliteOrbitScale(
    semiMajorAxisKm: number,
    eccentricity: number,
    minDistanceKm: number,
    maxDistanceKm: number,
    parentRenderRadius: number,
    parentId?: string,
  ): number {
    const a = Math.max(semiMajorAxisKm, 1e-9);
    const e = THREE.MathUtils.clamp(eccentricity, 0, 0.999);
    const { maxR } = this.moonBand(parentRenderRadius, parentId);
    const size = this.mapSatelliteDistance(
      a,
      minDistanceKm,
      maxDistanceKm,
      parentRenderRadius,
      parentId,
    );
    return Math.min(size / a, maxR / (a * (1 + e)));
  }

  /**
   * Real parent-local orbit radius (km) → render units. THE shared orbit
   * path for moons: orbit-line vertices (OrbitRenderer.isMoon branch) and
   * the animated body (CelestialBody.moonRenderDistance) call this, so the
   * moon always rides its drawn line in every distance mode, and the line
   * is a closed similar ellipse, never a cardioid (t_d17906bf).
   */
  mapSatelliteOrbitRadius(
    radiusKm: number,
    semiMajorAxisKm: number,
    eccentricity: number,
    minDistanceKm: number,
    maxDistanceKm: number,
    parentRenderRadius: number,
    parentId?: string,
  ): number {
    return (
      this.satelliteOrbitScale(
        semiMajorAxisKm,
        eccentricity,
        minDistanceKm,
        maxDistanceKm,
        parentRenderRadius,
        parentId,
      ) * radiusKm
    );
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
      case "huge":
      case "gigantic":
      case "enhanced":
      default:
        // huge/gigantic magnify the SAME √-compressed mapping (×3/×10) so
        // relative ordering is preserved — only the on-screen size grows.
        r =
          body.type === "moon"
            ? THREE.MathUtils.clamp(0.16 + 0.4 * Math.sqrt(ratio), 0.16, 0.75)
            : THREE.MathUtils.clamp(0.55 + 0.65 * Math.sqrt(ratio), 0.55, 4.0);
        r *= SIZE_MODE_MULTIPLIER[this.sizeMode] ?? 1;
    }

    return r;
  }

  /** Current scale-mode explanation for UI/tooltip (spec §4, §10). */
  get scaleMode(): string {
    return this.distanceModeLabel();
  }

  /** Localised distance-mode label (t_292b0645); default = current language. */
  distanceModeLabel(lang?: Lang): string {
    if (this.distanceMode === "log") return t("scale.dist.log", undefined, lang);
    if (this.distanceMode === "linear") return t("scale.dist.linear", undefined, lang);
    const anchor = this.focusAnchorId ? getBodyById(this.focusAnchorId) : undefined;
    return anchor
      ? t("scale.dist.focus", { name: bodyDisplayName(anchor, lang) }, lang)
      : t("scale.dist.focusSun", undefined, lang);
  }

  /** Localised size-mode label (t_292b0645); default = current language. */
  sizeModeLabel(lang?: Lang): string {
    const key = (
      {
        enhanced: "scale.size.enhanced",
        relative: "scale.size.relative",
        uniform: "scale.size.uniform",
        huge: "scale.size.huge",
        gigantic: "scale.size.gigantic",
      } as const
    )[this.sizeMode];
    return t(key, undefined, lang);
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
  ): { units: number; fromLabel: string } | undefined {
    const body = SOLAR_SYSTEM.find((b) => b.id === bodyId);
    if (!body) return undefined;
    if (body.type === "star") return { units: 0, fromLabel: "—" };
    if (body.type === "moon") {
      const p = ellipseOf(body, simDays); // km units for moons
      const range = moonRange ?? { minKm: p.x, maxKm: Math.abs(p.x) + 1 };
      return {
        // Same shared orbit mapper as the rendered position → the number in
        // the panel is the distance the body actually sits at (spec §10).
        units: this.mapSatelliteOrbitRadius(
          p.r,
          body.semiMajorAxis ?? 0,
          body.eccentricity ?? 0,
          range.minKm,
          range.maxKm,
          parentRenderRadius,
          body.parentId,
        ),
        fromLabel: t("scale.from.parent", {
          name: nameOf(getBodyById(body.parentId ?? "")),
        }),
      };
    }
    const p = ellipseOf(body, simDays);
    const out = { x: 0, cz: 0 };
    this.mapHeliocentricPlanePoint(p, this.anchorPlanePositionAU(simDays), out);
    const from = this.focusActive
      ? t("scale.from.focus", { name: nameOf(getBodyById(this.focusAnchorId ?? "")) })
      : t("scale.from.sun");
    return { units: Math.hypot(out.x, out.cz), fromLabel: from };
  }
}

/** Current-language name of a possibly-missing body ("?" placeholder). */
function nameOf(body: CelestialBodyData | undefined): string {
  return body ? bodyDisplayName(body) : "?";
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
