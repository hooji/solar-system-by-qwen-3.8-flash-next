/**
 * ScaleManager — the single place that converts REAL astronomical values into
 * RENDER units. Render values must never be confused with real data (spec §1,
 * §6, §15). Distance modes and size modes follow spec §4 and §6.
 */
import * as THREE from "three";
import { SOLAR_SYSTEM, maxHeliocentricDistanceAU, type CelestialBodyData } from "../data/solarSystemData";

export type DistanceMode = "log" | "linear" | "focus";
export type SizeMode = "enhanced" | "relative" | "uniform";

export interface ScaleConfig {
  /** Pluto-scale maximum AU used by log mapping (spec §4). */
  maxDistanceAU: number;
  minRenderDistance: number;
  maxRenderDistance: number;
  /** Linear-mode AU→unit factor (world would be huge; inner planets crowd). */
  linearUnitsPerAU: number;
  sunRenderRadius: number;
}

export const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  maxDistanceAU: 39.6, // largest stored planetary a (Pluto, JPL SBDB)
  minRenderDistance: 16,
  maxRenderDistance: 190,
  linearUnitsPerAU: 4.7, // Neptune ≈ 141 units in linear mode
  sunRenderRadius: 8,
};

export class ScaleManager {
  distanceMode: DistanceMode = "log";
  sizeMode: SizeMode = "enhanced";

  private readonly cfg: ScaleConfig;
  /** AU value at which log and linear mappings agree (for focus blending). */
  readonly maxAU: number;

  constructor(cfg: Partial<ScaleConfig> = {}) {
    this.cfg = { ...DEFAULT_SCALE_CONFIG, ...cfg };
    this.maxAU = Math.max(this.cfg.maxDistanceAU, maxHeliocentricDistanceAU());
  }

  /**
   * Log-compressed heliocentric distance (spec §4):
   * d_render = min + (log1p(AU)/log1p(maxAU)) * (max - min)
   */
  mapHeliocentricDistance(distanceAU: number): number {
    const { minRenderDistance, maxRenderDistance, linearUnitsPerAU } = this.cfg;
    if (this.distanceMode === "linear") {
      return distanceAU * linearUnitsPerAU;
    }
    const normalized = Math.log1p(distanceAU) / Math.log1p(this.maxAU);
    return minRenderDistance + normalized * (maxRenderDistance - minRenderDistance);
  }

  /**
   * Moon local-orbit mapping (spec §5): log1p over the shifted range inside a
   * planetary system, output 2.5×–9× of the parent's rendered radius.
   */
  mapSatelliteDistance(
    distanceKm: number,
    minDistanceKm: number,
    maxDistanceKm: number,
    parentRenderRadius: number,
  ): number {
    const minR = parentRenderRadius * 2.5;
    const maxR = parentRenderRadius * 9;
    const shifted = Math.max(0, distanceKm - minDistanceKm);
    const shiftedMax = Math.max(1, maxDistanceKm - minDistanceKm);
    const normalized = Math.log1p(shifted) / Math.log1p(shiftedMax);
    return minR + normalized * (maxR - minR);
  }

  /** Rendered body radius under the active size mode (spec §6). */
  mapBodyRadius(body: CelestialBodyData): number {
    const EARTH_R = 6371.0084; // Earth mean radius km (JPL [S1])
    const ratio = body.radiusKm / EARTH_R;

    if (body.type === "star") return this.cfg.sunRenderRadius;

    switch (this.sizeMode) {
      case "uniform":
        return 0.6;
      case "relative":
        // Stronger emphasis on true ratios, still clamped for visibility.
        return THREE.MathUtils.clamp(0.25 + 0.35 * ratio, 0.25, 6.5);
      case "enhanced":
      default:
        if (body.type === "moon") {
          return THREE.MathUtils.clamp(0.16 + 0.4 * Math.sqrt(ratio), 0.16, 0.75);
        }
        return THREE.MathUtils.clamp(0.55 + 0.65 * Math.sqrt(ratio), 0.55, 4.0);
    }
  }

  distanceModeLabelKo(): string {
    return this.distanceMode === "log"
      ? "로그 거리 스케일 (log scale)"
      : this.distanceMode === "linear"
        ? "선형 거리 스케일 (linear scale)"
        : "포커스 스케일 (focus scale)";
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
}
