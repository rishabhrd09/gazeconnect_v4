/** Input validity is mandatory; smoothing preferences cannot disable it. */
export const GAZE_STALE_MS = 150;
export const GAZE_RECOVERY_MS = 1000;

export interface GazeSample {
  x: number;
  y: number;
  is_valid: boolean;
  signal_state?: string;
  t_helper_ms?: number;
  t_sent_wall_ms?: number;
  sample_age_ms?: number;
}

export function isUsableGaze(sample: GazeSample, wallNow: number): boolean {
  if (!sample || sample.is_valid !== true || !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) || sample.x < 0 || sample.x > 1 || sample.y < 0 || sample.y > 1) return false;
  if (sample.signal_state && sample.signal_state !== 'valid') return false;
  for (const stamp of [sample.t_helper_ms, sample.t_sent_wall_ms]) {
    if (stamp !== undefined && (!Number.isFinite(stamp) || stamp <= 0 ||
        wallNow - stamp > GAZE_STALE_MS || stamp - wallNow > GAZE_STALE_MS)) return false;
  }
  return sample.sample_age_ms === undefined || (Number.isFinite(sample.sample_age_ms) &&
    sample.sample_age_ms >= 0 && sample.sample_age_ms <= GAZE_STALE_MS);
}

/** Constant-space freshness gate; receipt of held/repeated data is not new gaze. */
export class GazeFreshness {
  private lastSampleAt = -Infinity;
  private lastHelperStamp = 0;
  private valid = false;
  receive(sample: GazeSample, wallNow: number, monotonicNow: number): boolean {
    if (!isUsableGaze(sample, wallNow)) { this.valid = false; return false; }
    if (sample.t_helper_ms && sample.t_helper_ms <= this.lastHelperStamp) return false;
    this.lastHelperStamp = sample.t_helper_ms || 0;
    this.lastSampleAt = monotonicNow;
    this.valid = true;
    return true;
  }
  lose(): void { this.valid = false; }
  age(monotonicNow: number): number { return monotonicNow - this.lastSampleAt; }
  allowsDwell(monotonicNow: number): boolean {
    return this.valid && this.age(monotonicNow) >= 0 && this.age(monotonicNow) <= GAZE_STALE_MS;
  }
}
