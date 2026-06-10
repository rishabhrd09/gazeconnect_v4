/**
 * gazeFlags.ts — runtime-toggleable gaze behavior flags (A/B switches).
 *
 * Safety rule (docs/EYE_TRACKING_CHANGES.md): every behavioral gaze change
 * ships behind one of these flags and is reversible at runtime without a
 * code edit.
 *
 * Defaults are ON since the 2026-06-11 on-rig A/B validation (lock-breaks
 * −28%/click, worst click residual 480px → 109px, no felt regression —
 * see docs/EYE_TRACKING_CHANGES.md "On-rig A/B results").
 *
 * Toggle from DevTools:
 *   window.__gazeFlags.get()                           // current values
 *   window.__gazeFlags.set('dwellPauseOnGap', false)   // revert one behavior
 *   window.__gazeFlags.reset()                         // restore ALL defaults
 *
 * Values persist in localStorage ('gazeconnect_gaze_flags') so a chosen
 * configuration survives restarts. Flags are read per-frame through the
 * live `gazeFlags` object, so set()/reset() take effect immediately.
 */

export interface GazeFlags {
  /**
   * Pause (never reset, never advance) dwell + onset timers while gaze is
   * stale (no fresh frame for >150ms) or the backend signal_state is not
   * 'valid' (blink / out-of-bounds / frozen stream). Prevents a dwell
   * click from firing mid-blink or mid-tracking-loss.
   */
  dwellPauseOnGap: boolean;
  /**
   * On lock-break (raw gaze escapes the locked target), save dwell
   * progress into the existing fixation-TTL store (resume within 1s)
   * instead of discarding it — same recovery the hit-test-miss path
   * already gets. Helps corner buttons where noise breaks the lock.
   */
  lockBreakProgressRetention: boolean;
}

const STORAGE_KEY = 'gazeconnect_gaze_flags';

const DEFAULTS: GazeFlags = {
  dwellPauseOnGap: true,
  lockBreakProgressRetention: true,
};

function loadStored(): Partial<GazeFlags> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Live flag object — read directly in hot paths (no getter overhead). */
export const gazeFlags: GazeFlags = { ...DEFAULTS, ...loadStored() };

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gazeFlags));
  } catch {
    /* storage unavailable — flags remain session-only */
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __gazeFlags: unknown }).__gazeFlags = {
    get: () => ({ ...gazeFlags }),
    set: (name: keyof GazeFlags, value: boolean): boolean => {
      if (!(name in DEFAULTS)) {
        console.warn(`[GazeFlags] Unknown flag '${String(name)}'. Known: ${Object.keys(DEFAULTS).join(', ')}`);
        return false;
      }
      gazeFlags[name] = !!value;
      persist();
      console.log(`[GazeFlags] ${String(name)} = ${!!value}`);
      return true;
    },
    reset: (): void => {
      (Object.keys(DEFAULTS) as (keyof GazeFlags)[]).forEach((k) => {
        gazeFlags[k] = DEFAULTS[k];
      });
      persist();
      console.log('[GazeFlags] reset to defaults (current-good behavior)');
    },
  };
}
