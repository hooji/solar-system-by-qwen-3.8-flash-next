/**
 * SimulationClock — wall-time-independent simulation clock (spec §8):
 * positions derive from accumulated simDays, so behavior is identical at any
 * frame rate. Time-scale presets follow the suggested ladder (1s = 1d … 1y).
 */
export interface TimeScalePreset {
  label: string;
  daysPerSecond: number;
}

export const TIME_SCALE_PRESETS: readonly TimeScalePreset[] = [
  { label: "1초 = 1일", daysPerSecond: 1 },
  { label: "1초 = 10일", daysPerSecond: 10 },
  { label: "1초 = 100일", daysPerSecond: 100 },
  { label: "1초 = 1년", daysPerSecond: 365.25 },
];

/** Korean label for a days-per-second value (preset label if exact, else generated). */
export function timeScaleLabelKo(daysPerSecond: number): string {
  const match = TIME_SCALE_PRESETS.find((p) => p.daysPerSecond === daysPerSecond);
  if (match) return match.label;
  return daysPerSecond >= 1
    ? `1초 = ${daysPerSecond.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}일`
    : `1초 = ${(daysPerSecond * 24).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`;
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
