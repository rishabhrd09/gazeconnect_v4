/**
 * The dwell progress a target had reached when the eyes left it, kept for a
 * moment so coming back continues instead of starting again.
 *
 * Why: a selection three quarters done went back to zero as soon as the gaze
 * touched a neighbour. On the keyboard the space bar is 124 px tall with
 * letter keys 9 px above it and word suggestions 2 px below, so that is one
 * ordinary wobble away; the maintainer's own recording (22 Sep 2026, 1920x1080
 * full screen) has its ring cancelled at 96 % and at 98 % and then restarted
 * from nothing. OptiKey 3.2.5 — his reference — banks the progress of every
 * key it leaves and resumes it without a new lock-on for 750 ms
 * (KeySelectionTriggerIncompleteFixationTtl in his own settings).
 *
 * One entry per target, the strongest progress kept, dropped after
 * BANK_TTL_MS, and the whole bank cleared when something is selected (OptiKey
 * does that too: after a selection the screen has moved on).
 */

export const BANK_TTL_MS = 1000;
/** More than this many targets waiting at once is a scan, not a return. */
export const BANK_MAX_ENTRIES = 8;

interface Entry<T> {
  target: T;
  progress: number;
  at: number;
  expiresAt: number;
}

export class DwellProgressBank<T extends { isConnected?: boolean }> {
  private entries: Entry<T>[] = [];

  get size(): number {
    return this.entries.length;
  }

  /** Remember where this target had got to (never lower than what is already banked). */
  save(target: T, progress: number, now: number, ttlMs: number = BANK_TTL_MS): void {
    if (!target || !(progress > 0) || progress >= 1) return;
    this.prune(now);
    const expiresAt = now + ttlMs;
    const found = this.entries.find(e => e.target === target);
    if (found) {
      found.progress = Math.max(found.progress, progress);
      found.at = now;
      found.expiresAt = expiresAt;
      return;
    }
    this.entries.push({ target, progress, at: now, expiresAt });
    if (this.entries.length > BANK_MAX_ENTRIES) {
      this.entries.sort((a, b) => a.at - b.at);
      this.entries.splice(0, this.entries.length - BANK_MAX_ENTRIES);
    }
  }

  /** What this target had reached, if the entry is still fresh; it stays banked. */
  peek(target: T, now: number): number | null {
    this.prune(now);
    const found = this.entries.find(e => e.target === target);
    return found ? found.progress : null;
  }

  /** The same, and the entry is used up: a resumed dwell owns it from here. */
  take(target: T, now: number): number | null {
    const progress = this.peek(target, now);
    if (progress !== null) this.forget(target);
    return progress;
  }

  forget(target: T): void {
    this.entries = this.entries.filter(e => e.target !== target);
  }

  /** After a selection, or when the dwell state is reset: nothing carries over. */
  clear(): void {
    this.entries = [];
  }

  prune(now: number): void {
    this.entries = this.entries.filter(e => (
      now < e.expiresAt && (e.target.isConnected === undefined || e.target.isConnected)
    ));
  }
}
