/**
 * SimulationClock — wall-time-independent simulation clock (spec §8):
 * positions derive from accumulated simDays, so behavior is identical at any
 * frame rate. Time-scale presets follow the suggested ladder (1s = 1d … 1y).
 * Preset LABELS live in the ui/i18n dictionary (t_292b0645): this module
 * carries only the i18n KEY, never a translated string, so the language
 * toggle re-labels them without touching the physics.
 */
import { t, type Lang, type MessageKey } from "../ui/i18n";

export interface TimeScalePreset {
  key: MessageKey;
  daysPerSecond: number;
}

export const TIME_SCALE_PRESETS: readonly TimeScalePreset[] = [
  { key: "ts.secDay", daysPerSecond: 1 },
  { key: "ts.secTenDays", daysPerSecond: 10 },
  { key: "ts.secHundredDays", daysPerSecond: 100 },
  { key: "ts.secYear", daysPerSecond: 365.25 },
];

/**
 * Localised label for a days-per-second value (preset key if the value is an
 * exact preset, else a generated `{v}` message). Defaults to the CURRENT
 * language; Node tests without a toggle run resolve to the Korean default.
 */
export function timeScaleLabel(daysPerSecond: number, lang?: Lang): string {
  const match = TIME_SCALE_PRESETS.find((p) => p.daysPerSecond === daysPerSecond);
  if (match) return t(match.key, undefined, lang);
  return daysPerSecond >= 1
    ? t("ts.days", { v: daysPerSecond.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) }, lang)
    : t("ts.hours", { v: (daysPerSecond * 24).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) }, lang);
}

export class SimulationClock {
  /** Accumulated simulation time since epoch (simulated days from J2000). */
  simDays = 0;
  playing = true;
  daysPerSecond = 10; // default: outer-planet motion observable

  private lastRealMs: number | null = null;

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  setTimeScale(daysPerSecond: number): void {
    this.daysPerSecond = daysPerSecond;
  }

  reset(simDays = 0): void {
    this.simDays = simDays;
    this.lastRealMs = null;
  }

  /** Advance by real elapsed ms (from requestAnimationFrame timestamp). */
  update(realMs: number): void {
    if (this.lastRealMs === null) {
      this.lastRealMs = realMs;
      return;
    }
    const dtSec = Math.min(1, (realMs - this.lastRealMs) / 1000); // clamp tab-switch jumps
    this.lastRealMs = realMs;
    if (this.playing) this.simDays += dtSec * this.daysPerSecond;
  }

  /** Elapsed whole days for HUD. */
  elapsedDays(): number {
    return this.simDays;
  }
}
