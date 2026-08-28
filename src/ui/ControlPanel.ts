/**
 * ControlPanel — HUD controls (spec §8, §14). Kept deliberately small and
 * framework-free; the panel show/hide toggle system (task t_30700e13) builds
 * on top of the `.panel` elements and the callbacks exposed here.
 */
import { TIME_SCALE_PRESETS } from "../core/SimulationClock";
import type { DistanceMode, SizeMode } from "../core/ScaleManager";

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

export class ControlPanel {
  private readonly root: HTMLElement;
  private readonly clockEl: HTMLElement;

  constructor(container: HTMLElement, cb: ControlPanelCallbacks) {
    this.root = document.createElement("aside");
    this.root.className = "panel control-panel";
    this.root.setAttribute("aria-label", "시뮬레이션 제어");

    const header = document.createElement("div");
    header.className = "panel-header";
    const title = document.createElement("h2");
    title.textContent = "제어";
    header.appendChild(title);
    this.root.appendChild(header);

    // Transport row.
    const transport = document.createElement("div");
    transport.className = "row";
    const play = btn("재생", () => cb.onPlay());
    const pause = btn("정지", () => cb.onPause());
    const reset = btn("리셋", () => cb.onReset());
    transport.append(play, pause, reset);
    this.root.appendChild(transport);

    // Time scale.
    const tsRow = document.createElement("div");
    tsRow.className = "row";
    tsRow.appendChild(document.createTextNode("배속 "));
    const sel = document.createElement("select");
    TIME_SCALE_PRESETS.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(p.daysPerSecond);
      opt.textContent = p.label;
      if (i === 1) opt.selected = true; // default 1s = 10일
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => cb.onTimeScale(parseFloat(sel.value)));
    tsRow.appendChild(sel);
    this.root.appendChild(tsRow);

    this.clockEl = document.createElement("div");
    this.clockEl.className = "row sim-clock";
    this.root.appendChild(this.clockEl);

    // Distance mode.
    this.root.appendChild(
      modeRow<DistanceMode>(
        "거리 스케일",
        [
          ["log", "Log"],
          ["linear", "Linear"],
          ["focus", "Focus"],
        ],
        (m) => cb.onDistanceMode(m),
      ),
    );
    // Size mode.
    this.root.appendChild(
      modeRow<SizeMode>(
        "크기 스케일",
        [
          ["enhanced", "Enhanced"],
          ["relative", "Relative"],
          ["uniform", "Uniform"],
        ],
        (m) => cb.onSizeMode(m),
      ),
    );

    // Visibility toggles.
    this.root.appendChild(toggleRow("궤도선", true, (v) => cb.onToggleOrbits(v)));
    this.root.appendChild(toggleRow("이름표", true, (v) => cb.onToggleLabels(v)));
    this.root.appendChild(toggleRow("위성", true, (v) => cb.onToggleMoons(v)));
    this.root.appendChild(toggleRow("별배경", true, (v) => cb.onToggleStars(v)));

    const camReset = document.createElement("div");
    camReset.className = "row";
    camReset.appendChild(btn("카메라 리셋", () => cb.onResetCamera()));
    this.root.appendChild(camReset);

    container.appendChild(this.root);
  }

  setClock(text: string): void {
    this.clockEl.textContent = text;
  }

  /** Panel element for overlay registration (task t_30700e13). */
  get element(): HTMLElement {
    return this.root;
  }
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function modeRow<T extends string>(
  labelText: string,
  modes: [T, string][],
  onPick: (m: T) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  const lab = document.createElement("span");
  lab.textContent = labelText + " ";
  row.appendChild(lab);
  for (const [mode, name] of modes) {
    const b = btn(name, () => onPick(mode));
    b.dataset.mode = mode;
    row.appendChild(b);
  }
  return row;
}

function toggleRow(labelText: string, initial: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement("label");
  row.className = "row toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initial;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(input, document.createTextNode(labelText));
  return row;
}
