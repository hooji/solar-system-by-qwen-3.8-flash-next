/**
 * ControlPanel — HUD controls (spec §8, §14). Kept deliberately small and
 * framework-free; the panel show/hide toggle system (task t_30700e13) builds
 * on top of the `.panel` elements and the callbacks exposed here.
 *
 * Localisation (task t_292b0645): every user-visible string comes from the
 * ui/i18n dictionary via t() — NONE is cached. The panel subscribes through
 * onLangChange and re-renders labels, aria state and select options against
 * the CURRENT language; teardown happens in dispose().
 */
import { TIME_SCALE_PRESETS, timeScaleLabel } from "../core/SimulationClock";
import type { DistanceMode, SizeMode } from "../core/ScaleManager";
import { getLang, onLangChange, t, type Lang, type MessageKey } from "./i18n";

export interface ControlPanelCallbacks {
  onPlay(): void;
  onPause(): void;
  onReset(): void;
  onTimeScale(daysPerSecond: number): void;
  onDistanceMode(mode: DistanceMode): void;
  onSizeMode(mode: SizeMode): void;
  onToggleOrbits(on: boolean): void;
  onToggleLabels(on: boolean): void;
  onToggleMoons(on: boolean): void;
  onToggleStars(on: boolean): void;
  onResetCamera(): void;
}

/** Translatable label nodes registered at build time, refreshed per language. */
interface LabelSink {
  el: Node;
  key: MessageKey;
  /** Fixed text glued after the translation (e.g. the row-label space). */
  suffix?: string;
}

export class ControlPanel {
  private readonly root: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedSel: HTMLSelectElement;
  private readonly speedLabel: HTMLElement;
  /** Every static label whose text is a dictionary lookup (button captions,
   *  row labels, option captions). One re-render path for all of them. */
  private readonly labels: LabelSink[] = [];
  private lastStatus: { clockText?: string; playing: boolean; daysPerSecond: number } | null =
    null;
  private readonly offLang: () => void;

  constructor(container: HTMLElement, cb: ControlPanelCallbacks) {
    this.root = document.createElement("aside");
    this.root.className = "panel control-panel";

    const header = document.createElement("div");
    header.className = "panel-header";
    const title = document.createElement("h2");
    this.bindLabel(title, "panel.control");
    header.appendChild(title);
    this.root.appendChild(header);

    // Transport row. `.active` shows which state the clock is in (spec §8:
    // current time & speed state must be clearly displayed).
    const transport = document.createElement("div");
    transport.className = "row";
    const play = btn(() => cb.onPlay());
    const pause = btn(() => cb.onPause());
    const reset = btn(() => cb.onReset());
    this.bindLabel(play, "control.play");
    this.bindLabel(pause, "control.pause");
    this.bindLabel(reset, "control.reset");
    transport.append(play, pause, reset);
    this.root.appendChild(transport);
    this.playBtn = play;
    this.pauseBtn = pause;

    // Time scale.
    const tsRow = document.createElement("div");
    tsRow.className = "row";
    const speedLab = document.createElement("span");
    this.bindLabel(speedLab, "control.speed", " "); // trailing space before the select
    tsRow.appendChild(speedLab);
    const sel = document.createElement("select");
    TIME_SCALE_PRESETS.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(p.daysPerSecond);
      this.bindLabel(opt, p.key);
      if (i === 1) opt.selected = true; // default 1s = 10일
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => cb.onTimeScale(parseFloat(sel.value)));
    tsRow.appendChild(sel);
    this.root.appendChild(tsRow);
    this.speedSel = sel;
    this.speedLabel = document.createElement("span");
    this.speedLabel.className = "sim-speed";
    tsRow.appendChild(this.speedLabel);

    this.clockEl = document.createElement("div");
    this.clockEl.className = "row sim-clock";
    this.clockEl.setAttribute("aria-live", "off");
    this.root.appendChild(this.clockEl);

    // Distance mode.
    this.root.appendChild(
      this.modeRow<DistanceMode>("control.distScale", [
        ["log", "Log"],
        ["linear", "Linear"],
        ["focus", "Focus"],
      ], (m) => cb.onDistanceMode(m)),
    );
    // Size mode.
    this.root.appendChild(
      this.modeRow<SizeMode>("control.sizeScale", [
        ["enhanced", "Enhanced"],
        ["relative", "Relative"],
        ["uniform", "Uniform"],
      ], (m) => cb.onSizeMode(m)),
    );

    // Visibility toggles.
    for (const [key, apply] of [
      ["control.orbits", cb.onToggleOrbits],
      ["control.labels", cb.onToggleLabels],
      ["control.moons", cb.onToggleMoons],
      ["control.stars", cb.onToggleStars],
    ] as [MessageKey, (v: boolean) => void][]) {
      this.root.appendChild(this.toggleRow(key, true, apply));
    }

    const camReset = document.createElement("div");
    camReset.className = "row";
    const camBtn = btn(() => cb.onResetCamera());
    this.bindLabel(camBtn, "control.camReset");
    camReset.appendChild(camBtn);
    this.root.appendChild(camReset);

    container.appendChild(this.root);

    this.renderLang(getLang());
    // The ONE re-render path: language change re-labels every string live.
    this.offLang = onLangChange((lang) => this.renderLang(lang));
  }

  /** Release the language subscription (teardownAll in main.ts). */
  dispose(): void {
    this.offLang();
  }

  /**
   * Live transport/speed readout (spec §8): elapsed sim time, the ACTIVE
   * time-scale label, and play state. Called at most 5×/s from the frame
   * loop (spec §16: update HUD only when necessary).
   */
  setStatus(status: {
    clockText: string;
    playing: boolean;
    daysPerSecond: number;
  }): void {
    this.lastStatus = status;
    this.clockEl.textContent = status.clockText;
    this.playBtn.classList.toggle("active", status.playing);
    this.pauseBtn.classList.toggle("active", !status.playing);
    this.playBtn.setAttribute("aria-pressed", String(status.playing));
    this.pauseBtn.setAttribute("aria-pressed", String(!status.playing));
    // Keep the selector in sync even if the speed was changed programmatically.
    const opt = String(status.daysPerSecond);
    if (this.speedSel.value !== opt && [...this.speedSel.options].some((o) => o.value === opt)) {
      this.speedSel.value = opt;
    }
    this.renderSpeedLabel(getLang());
  }

  /** Panel element for overlay registration (task t_30700e13). */
  get element(): HTMLElement {
    return this.root;
  }

  // --- internals -------------------------------------------------------------

  /** Register a node whose textContent is always `t(key)` in the live lang. */
  private bindLabel(el: Node, key: MessageKey, suffix = ""): void {
    this.labels.push({ el, key, suffix });
  }

  /** Re-render every dictionary-driven string against `lang`. */
  private renderLang(lang: Lang): void {
    this.root.setAttribute("aria-label", t("control.aria", undefined, lang));
    for (const { el, key, suffix } of this.labels) {
      el.textContent = t(key, undefined, lang) + (suffix ?? "");
    }
    this.renderSpeedLabel(lang);
  }

  /** "현재 1초 = 10일 · 재생 중" ↔ "Now 1s = 10 days · playing" — template so
   *  both languages keep their natural word order. */
  private renderSpeedLabel(lang: Lang): void {
    if (!this.lastStatus) return;
    const s = this.lastStatus;
    this.speedLabel.textContent = t(
      "control.now",
      {
        speed: timeScaleLabel(s.daysPerSecond, lang),
        state: t(s.playing ? "control.statePlaying" : "control.statePaused", undefined, lang),
      },
      lang,
    );
  }

  private modeRow<T extends string>(
    labelKey: MessageKey,
    modes: [T, string][],
    onPick: (m: T) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";
    const lab = document.createElement("span");
    this.bindLabel(lab, labelKey, " "); // trailing space after the row label (both languages)
    row.appendChild(lab);
    for (const [mode, name] of modes) {
      const b = btn(() => onPick(mode));
      b.textContent = name; // mode names are product terms — same in both languages
      b.dataset.mode = mode;
      row.appendChild(b);
    }
    return row;
  }

  private toggleRow(labelKey: MessageKey, initial: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement("label");
    row.className = "row toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = initial;
    input.addEventListener("change", () => onChange(input.checked));
    const text = document.createTextNode("");
    this.bindLabel(text, labelKey);
    row.append(input, text);
    return row;
  }
}

function btn(onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
