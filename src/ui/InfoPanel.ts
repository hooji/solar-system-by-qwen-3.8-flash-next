/**
 * InfoPanel + hover tooltip (spec §10). Renders REAL astronomical data and
 * RENDER values (screen-layout only) in clearly separated sections so the
 * two can never be confused (task t_d9203468). All real-value formatting —
 * current-language names, units, km↔AU conversion, missing-data placeholders
 * — comes from ui/format.ts, the ONE display-rule set.
 *
 * Content follows the selection state: `showBody(id)` renders a selection,
 * `refresh()` re-renders the SAME selection against the current sim time so
 * moving bodies and changing render modes update the panel without touching
 * DOM state directly (no divergent display states).
 *
 * Localisation (task t_292b0645): row labels, section separators, type names
 * and the aria-label resolve through ui/i18n t() at render time. The frame
 * loop refreshes the visible selection ≥5×/s (and language changes trigger a
 * re-render directly), so switching EN/한국어 re-labels the panel live.
 */
import type { CelestialBodyData } from "../data/solarSystemData";
import { getBodyById, getChildrenOf } from "../data/solarSystemData";
import type { ScaleManager } from "../core/ScaleManager";
import { ellipseOf } from "../core/ScaleManager";
import {
  MISSING_DISPLAY,
  displayName,
  fmt,
  formatDistanceAu,
  formatDistanceKm,
  formatPeriodDays,
  formatRotationHours,
} from "./format";
import { onLangChange, t, type Lang, type MessageKey } from "./i18n";

const TYPE_KEYS: Record<CelestialBodyData["type"], MessageKey> = {
  star: "type.star",
  planet: "type.planet",
  "dwarf-planet": "type.dwarf-planet",
  moon: "type.moon",
};

/** Section headers inside the panel — real data vs screen-layout values. */
const SEP_KEYS = {
  real: "info.sep.real",
  render: "info.sep.render",
  mode: "info.sep.mode",
} as const;

export class InfoPanel {
  private readonly root: HTMLElement;
  /** Content host — showBody re-renders HERE, never by wiping `root`
   *  (root carries the collapse button overlay.register injects). */
  private readonly content: HTMLElement;
  private readonly tooltip: HTMLElement;
  /** Last hovered body — lets a language change re-label a visible tooltip. */
  private tooltipBody: CelestialBodyData | null = null;
  private readonly offLang: () => void;

  constructor(
    container: HTMLElement,
    private readonly scale: ScaleManager,
    private readonly renderOf: (body: CelestialBodyData) => {
      distance: number;
      radius: number;
      fromLabel: string;
    },
  ) {
    this.root = document.createElement("section");
    this.root.className = "panel info-panel";
    this.root.hidden = true;
    this.content = document.createElement("div");
    this.content.className = "info-content";
    this.root.appendChild(this.content);
    container.appendChild(this.root);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    this.tooltip.hidden = true;
    container.appendChild(this.tooltip);

    // Live re-label on language change: the visible selection re-renders and
    // a visible tooltip re-labels; hidden hosts simply pick the new language
    // up on their next showBody/render (nothing is cached).
    this.offLang = onLangChange(() => {
      this.root.setAttribute("aria-label", t("info.aria"));
      this.refresh();
      if (this.tooltipBody && !this.tooltip.hidden) {
        this.renderTooltipText(this.tooltipBody);
      }
    });
    this.root.setAttribute("aria-label", t("info.aria"));
  }

  /** Release the language subscription (teardownAll in main.ts). */
  dispose(): void {
    this.offLang();
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
   * (moving body, mode switch, language switch). The single refresh path
   * main.ts calls from the frame loop — callers never edit the panel DOM
   * themselves, so the display can never diverge from the selection state.
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
    this.tooltipBody = b;
    this.renderTooltipText(b);
    this.tooltip.hidden = false;
  }

  hideTooltip(): void {
    this.tooltip.hidden = true;
    this.tooltipBody = null;
  }

  // --- internals -------------------------------------------------------------

  private selectedId: string | null = null;

  /** Tooltip caption: current-language name · localised type (t_292b0645). */
  private renderTooltipText(b: CelestialBodyData, lang?: Lang): void {
    this.tooltip.textContent = `${displayName(b.nameKo, b.nameEn, lang)} · ${t(TYPE_KEYS[b.type], undefined, lang)}`;
  }

  private render(b: CelestialBodyData): void {
    const r = this.renderOf(b);
    const moons = getChildrenOf(b.id);
    const isMoon = b.type === "moon";
    const parent = b.parentId ? getBodyById(b.parentId) : undefined;
    const refLabel = isMoon
      ? t("info.ref.moon", { name: displayName(parent?.nameKo, parent?.nameEn) })
      : t("info.ref.sun");

    // CURRENT real distance from the live Kepler solution — same dataset
    // values, same ui/format rules (semi-major axis stays a labelled
    // average; the live figure is its own row).
    const live = b.semiMajorAxis !== undefined ? ellipseOf(b, this.simDays()) : null;
    const liveDistLabel = !live
      ? MISSING_DISPLAY
      : isMoon
        ? formatDistanceKm(live.r, refLabel)
        : formatDistanceAu(live.r, refLabel);
    const avgDistLabel =
      b.semiMajorAxis === undefined
        ? MISSING_DISPLAY
        : isMoon
          ? formatDistanceKm(b.semiMajorAxis, refLabel)
          : formatDistanceAu(b.semiMajorAxis, refLabel);

    // Every label resolves through t() against the CURRENT language at
    // render time — the row table is rebuilt fresh, nothing is cached.
    const rows: [string, string][] = [
      [t(SEP_KEYS.real), ""],
      [t("info.kind"), t(TYPE_KEYS[b.type])],
      [
        t("info.radius"),
        b.radiusKm !== undefined ? `${fmt(b.radiusKm, 1)} km` : MISSING_DISPLAY,
      ],
      [t("info.avgDist"), avgDistLabel],
      [t("info.liveDist"), liveDistLabel],
      [t("info.period"), formatPeriodDays(b.orbitalPeriodDays)],
      [t("info.rotation"), formatRotationHours(b.rotationPeriodHours)],
      [t("info.ecc"), b.eccentricity !== undefined ? fmt(b.eccentricity, 4) : MISSING_DISPLAY],
      [
        t("info.incl"),
        b.inclinationDeg !== undefined ? `${fmt(b.inclinationDeg, 2)}°` : MISSING_DISPLAY,
      ],
      [t(SEP_KEYS.render), ""],
      [t("info.renderRadius"), `${fmt(r.radius, 2)} units`],
      [t("info.renderDist"), `${fmt(r.distance, 1)} units · ${r.fromLabel}`],
      [t(SEP_KEYS.mode), ""],
      [t("info.distMode"), this.scale.distanceModeLabel()],
      [t("info.sizeMode"), this.scale.sizeModeLabel()],
    ];
    if (moons.length) {
      rows.push([t("info.moons"), moons.map((m) => displayName(m.nameKo, m.nameEn)).join(", ")]);
    }
    const sepSet = new Set(Object.values(SEP_KEYS).map((k) => t(k)));

    this.content.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = displayName(b.nameKo, b.nameEn);
    this.content.appendChild(h);

    const dl = document.createElement("dl");
    for (const [k, v] of rows) {
      if (sepSet.has(k)) {
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
