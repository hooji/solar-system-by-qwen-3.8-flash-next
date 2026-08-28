/**
 * InfoPanel + hover tooltip (spec §10). Renders REAL values and RENDER values
 * as separate, clearly-labeled lines. Public API: onSelect(id) is the event
 * contract the overlay-toggle task (t_30700e13) can hook into.
 */
import type { CelestialBodyData } from "../data/solarSystemData";
import { getBodyById, getChildrenOf } from "../data/solarSystemData";
import type { ScaleManager } from "../core/ScaleManager";

const TYPE_KO: Record<CelestialBodyData["type"], string> = {
  star: "항성",
  planet: "행성",
  "dwarf-planet": "왜소행성",
  moon: "위성",
};

function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly tooltip: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly scale: ScaleManager,
    private readonly renderOf: (body: CelestialBodyData) => { distance: number; radius: number },
  ) {
    this.root = document.createElement("section");
    this.root.className = "panel info-panel";
    this.root.setAttribute("aria-label", "천체 정보");
    this.root.hidden = true;
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
    const r = this.renderOf(b);
    const moons = getChildrenOf(b.id);
    const isMoon = b.type === "moon";
    const parent = b.parentId ? getBodyById(b.parentId) : undefined;
    const realDistLabel = isMoon
      ? `${fmt(b.semiMajorAxis, 0)} km (${parent?.nameKo ?? "?"} 기준)`
      : b.semiMajorAxis !== undefined
        ? `${fmt(b.semiMajorAxis)} AU`
        : "—";

    this.root.innerHTML = "";
    const h = document.createElement("h2");
    h.textContent = `${b.nameKo} · ${b.nameEn}`;
    this.root.appendChild(h);

    const rows: [string, string][] = [
      ["종류", TYPE_KO[b.type]],
      ["실제 반지름", `${fmt(b.radiusKm, 1)} km`],
      ["평균 거리", realDistLabel],
      ["공전 주기", b.orbitalPeriodDays !== undefined ? `${fmt(b.orbitalPeriodDays, 2)} 일` : "—"],
      ["자전 주기", b.rotationPeriodHours !== undefined ? `${fmt(Math.abs(b.rotationPeriodHours), 2)} h${b.rotationPeriodHours < 0 ? " (역행)" : ""}` : "—"],
      ["이심률", b.eccentricity !== undefined ? fmt(b.eccentricity, 4) : "—"],
      ["공전 경사", b.inclinationDeg !== undefined ? `${fmt(b.inclinationDeg, 2)}°` : "—"],
      ["── 렌더 값 ──", ""],
      ["렌더 반지름", `${fmt(r.radius, 2)} units`],
      ["렌더 거리", `${fmt(r.distance, 1)} units`],
      ["거리 표현", this.scale.distanceModeLabelKo()],
      ["크기 표현", this.scale.sizeModeLabelKo()],
    ];
    if (moons.length) {
      rows.push(["위성 목록", moons.map((m) => m.nameKo).join(", ")]);
    }
    const dl = document.createElement("dl");
    for (const [k, v] of rows) {
      if (k.startsWith("──")) {
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
    this.root.appendChild(dl);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Panel element for overlay registration (task t_30700e13). */
  get element(): HTMLElement {
    return this.root;
  }

  showTooltip(x: number, y: number, b: CelestialBodyData): void {
    this.tooltip.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    this.tooltip.textContent = `${b.nameKo} / ${b.nameEn} · ${TYPE_KO[b.type]}`;
    this.tooltip.hidden = false;
  }

  hideTooltip(): void {
    this.tooltip.hidden = true;
  }
}
