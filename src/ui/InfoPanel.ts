/**
 * InfoPanel + hover tooltip (spec §10). Renders REAL astronomical data and
 * RENDER values (screen-layout only) in clearly separated sections so the
 * two can never be confused (task t_d9203468). All real-value formatting —
 * bilingual names, units, km↔AU conversion, missing-data placeholders —
 * comes from ui/format.ts, the ONE display-rule set.
 *
 * Content follows the selection state: `showBody(id)` renders a selection,
 * `refresh()` re-renders the SAME selection against the current sim time so
 * moving bodies and changing render modes update the panel without touching
 * DOM state directly (no divergent display states).
 */
import type { CelestialBodyData } from "../data/solarSystemData";
import { getBodyById, getChildrenOf } from "../data/solarSystemData";
import type { ScaleManager } from "../core/ScaleManager";
import { ellipseOf } from "../core/ScaleManager";
import {
  MISSING_DISPLAY,
  bilingualName,
  fmt,
  formatDistanceAu,
  formatDistanceKm,
  formatPeriodDays,
  formatRotationHours,
} from "./format";

const TYPE_KO: Record<CelestialBodyData["type"], string> = {
  star: "항성",
  planet: "행성",
  "dwarf-planet": "왜소행성",
  moon: "위성",
};

/** Section headers inside the panel — real data vs screen-layout values. */
const SEP_REAL = "실제 천문 데이터 (real astronomical data)";
const SEP_RENDER = "화면 렌더 값 — 배치용, 실데이터 아님 (render values)";
const SEP_MODE = "화면 표현 (display modes)";

export class InfoPanel {
  private readonly root: HTMLElement;
  /** Content host — showBody re-renders HERE, never by wiping `root`
   *  (root carries the collapse button overlay.register injects). */
  private readonly content: HTMLElement;
  private readonly tooltip: HTMLElement;
  /** Current selection rendered into the panel; null = nothing shown. */
  private selectedId: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly scale: ScaleManager,
    private readonly renderOf: (body: CelestialBodyData) => {
      distance: number;
      radius: number;
      fromLabelKo: string;
    },
  ) {
    this.root = document.createElement("section");
    this.root.className = "panel info-panel";
    this.root.setAttribute("aria-label", "천체 정보");
    this.root.hidden = true;
    this.content = document.createElement("div");
    this.content.className = "info-content";
    this.root.appendChild(this.content);
    container.appendChild(this.root);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    this.tooltip.hidden = true;
    container.appendChild(this.tooltip);
  }

  /** Event contract: called by selection logic in main.ts. */
  showBody(id: string): void {
    const b = getBodyById(id);
    if (!b) return;
    this.selectedId = b.id;
    this.render(b);
    this.root.hidden = false;
  }

  /**
   * Re-render the CURRENT selection against the live sim/render state
   * (moving body, mode switch). The single refresh path main.ts calls from
   * the frame loop — callers never edit the panel DOM themselves, so the
   * display can never diverge from the selection state.
   */
  refresh(): void {
    if (!this.selectedId || this.root.hidden) return;
    const b = getBodyById(this.selectedId);
    if (!b) {
      this.hide();
      return;
    }
    this.render(b);
  }

  hide(): void {
    this.selectedId = null;
    this.root.hidden = true;
  }

  /** Panel element for overlay registration (task t_30700e13). */
  get element(): HTMLElement {
    return this.root;
  }

  showTooltip(x: number, y: number, b: CelestialBodyData): void {
    this.tooltip.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    this.tooltip.textContent = `${bilingualName(b.nameKo, b.nameEn)} · ${TYPE_KO[b.type]}`;
    this.tooltip.hidden = false;
  }

  hideTooltip(): void {
    this.tooltip.hidden = true;
  }

  // --- internals -------------------------------------------------------------

  private render(b: CelestialBodyData): void {
    const r = this.renderOf(b);
    const moons = getChildrenOf(b.id);
    const isMoon = b.type === "moon";
    const parent = b.parentId ? getBodyById(b.parentId) : undefined;
    const refKo = isMoon
      ? `${parent?.nameKo ?? MISSING_DISPLAY}(${parent?.nameEn ?? "?"}) 기준`
      : "태양(Sun) 기준";

    // CURRENT real distance from the live Kepler solution — same dataset
    // values, same ui/format rules (semi-major axis stays a labelled
    // average; the live figure is its own row).
    const live = b.semiMajorAxis !== undefined ? ellipseOf(b, this.simDays()) : null;
    const liveDistLabel = !live
      ? MISSING_DISPLAY
      : isMoon
        ? formatDistanceKm(live.r, refKo)
        : formatDistanceAu(live.r, refKo);
    const avgDistLabel =
      b.semiMajorAxis === undefined
        ? MISSING_DISPLAY
        : isMoon
          ? formatDistanceKm(b.semiMajorAxis, refKo)
          : formatDistanceAu(b.semiMajorAxis, refKo);

    const rows: [string, string][] = [
      [SEP_REAL, ""],
      ["종류", TYPE_KO[b.type]],
      [
        "실제 평균 반지름",
        b.radiusKm !== undefined ? `${fmt(b.radiusKm, 1)} km` : MISSING_DISPLAY,
      ],
      ["평균 거리 (반장축)", avgDistLabel],
      ["현재 실제 거리", liveDistLabel],
      ["공전 주기", formatPeriodDays(b.orbitalPeriodDays)],
      ["자전 주기", formatRotationHours(b.rotationPeriodHours)],
      ["이심률 (무차원)", b.eccentricity !== undefined ? fmt(b.eccentricity, 4) : MISSING_DISPLAY],
      [
        "공전 경사 (deg)",
        b.inclinationDeg !== undefined ? `${fmt(b.inclinationDeg, 2)}°` : MISSING_DISPLAY,
      ],
      [SEP_RENDER, ""],
      ["렌더 반지름", `${fmt(r.radius, 2)} units`],
      ["렌더 거리", `${fmt(r.distance, 1)} units · ${r.fromLabelKo}`],
      [SEP_MODE, ""],
      ["거리 표현", this.scale.distanceModeLabelKo()],
      ["크기 표현", this.scale.sizeModeLabelKo()],
    ];
    if (moons.length) {
      rows.push(["위성 목록", moons.map((m) => bilingualName(m.nameKo, m.nameEn)).join(", ")]);
    }

    this.content.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = bilingualName(b.nameKo, b.nameEn);
    this.content.appendChild(h);

    const dl = document.createElement("dl");
    for (const [k, v] of rows) {
      if (k === SEP_REAL || k === SEP_RENDER || k === SEP_MODE) {
        const sep = document.createElement("dt");
        sep.className = "sep";
        sep.textContent = k;
        dl.appendChild(sep);
        continue;
      }
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    this.content.appendChild(dl);
  }

  /**
   * Sim-time source for live distances: ScaleManager carries no clock, so
   * main.ts injects one. Falls back to 0 (J2000 epoch positions) if none is
   * provided — still real data, just not advanced.
   */
  private simDaysProvider: (() => number) | null = null;

  setSimDaysProvider(fn: () => number): void {
    this.simDaysProvider = fn;
  }

  private simDays(): number {
    return this.simDaysProvider?.() ?? 0;
  }
}
