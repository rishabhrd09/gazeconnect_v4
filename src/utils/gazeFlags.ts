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
  /**
   * In-page BROWSER cursor (YouTube / quick search): save dwell progress
   * across stability breaks and resume within 1s on the same target.
   * Forwarded into the BrowserView via browserGazeConfig
   * (progressRetentionEnabled) so it persists across page loads —
   * setting window.gcConfig in the page only lasts one document.
   * Applied when the web screen (re)configures the browser.
   */
  browserProgressRetention: boolean;
  /**
   * In-page BROWSER cursor: freeze dwell clocks across >150ms gaps in
   * the gaze stream (blink / look-away / stall) instead of letting the
   * wall-clock dwell jump-commit when frames resume. Forwarded as
   * browserGazeConfig.gapPauseEnabled (persists across page loads).
   */
  browserGapPause: boolean;
  /**
   * B1-FE (on-rig A/B prototype, default OFF): calm the gaze toggle.
   * Pull layers: snap radius 220→150, snap strength 0.36→0.28, priority
   * score bonus capped at 0.3 (was up to 0.6), gaze-ON assist pull
   * 0.12/112px→0.08/90px.
   * Capture sequence (2026-07-06 on-rig video: "once it moves very near,
   * it magnetically takes the cursor to the toggle centre; dwell is very
   * fast"): with gaze ON, the toggle additionally loses its 100ms fast
   * onset (standard 250ms instead), the teleport-to-centre on onset
   * completion (replaced by a gradual 25%/frame settle), the ±64px
   * extended hit points, and the +30px nearest-centre acquisition
   * margin; its dwell lengthens 1150→1450ms.
   * EVERY gaze-OFF path is deliberately untouched (assist 0.18/140px,
   * 100ms onset, 850ms dwell, full reach) — that is the bootstrap for
   * re-enabling gaze. Emergency is untouched in all states. Backend
   * magnetism is tuned separately (set_magnet_params WS message).
   */
  toggleCalmFrontend: boolean;
  /**
   * B2 (on-rig A/B prototype, default OFF): calmer snapping for home
   * screen tiles — radius 140→120, strength 0.30→0.22, and the ×1.45
   * near-center proximity boost OFF (the exact keyboard/prediction
   * precedent for the "over-responsive" complaint). Addresses "cursor
   * rushing on the home screen".
   */
  homeSnapCalm: boolean;
  /**
   * B3 (on-rig A/B prototype, default OFF): in-page BROWSER cursor —
   * bank dwell progress PER TARGET (OptiKey-style concurrent bank)
   * instead of the single save slot, so ping-ponging between adjacent
   * links on dense pages (Google results) accumulates each link's
   * progress instead of discarding it on every flip. Forwarded as
   * browserGazeConfig.progressBankEnabled (persists across page loads).
   * Validated offline by replay scenario S13 before any rig session.
   */
  browserProgressBank: boolean;
  /**
   * KEYBOARD plan B1 (on-rig A/B prototype, default OFF): stage-specific
   * keyboard cadence. For keyboard-context targets ONLY, replaces the
   * hardcoded 250ms onset with the stage's honest onset, the letter dwell
   * with the stage's tuned dwell, and the hidden +1000ms cooldown floor
   * with the stage's configurable cooldown base — all from
   * KEYBOARD_CADENCE_BY_STAGE. Faster at every ALS stage, driven mostly by
   * the cooldown. Never touches nav/home/emergency or non-keyboard screens.
   * With the flag OFF the table is never read and typing is byte-identical
   * to today. Ships WITH repeatGuard (below).
   */
  keyboardCadence: boolean;
  /**
   * KEYBOARD plan B2 (on-rig A/B prototype, default OFF): continuity guard on
   * the fast-repeat dwell. The repeat accelerator ([0,250,350]) is already
   * same-key gated; this adds that it only applies if the gaze did NOT
   * acquire a DIFFERENT target since the last click on this key — so an
   * unintended look-away-and-return to the same letter no longer triggers a
   * 250ms fast repeat (it falls back to the full dwell). Only ever LENGTHENS
   * a repeat; with the flag OFF the accelerator behaves as today.
   */
  repeatGuard: boolean;
  /**
   * KEYBOARD plan B3 (on-rig A/B prototype, default OFF): ZoneBoard cost
   * restructure. (1) Spatial-keyboard LETTERS get the keyboardKey dwell
   * category (≈1485ms at Mid) instead of falling through to standardButton
   * (≈1755ms). (2) The zone-entry buffer shrinks from max(1300,
   * standardButton×1.5)=2633ms at Mid to max(650, standardButton×0.45)≈790ms
   * — still ≥ letterOnset+250 (the invariant that keeps the buffer's
   * pass-through protection intact). Together these cut Mid per-letter cost
   * ~6.5s→~4.3s. With the flag OFF the ZoneBoard behaves byte-for-byte as
   * today. Requires rig validation + the buffer-pass-through replay scenario.
   */
  zoneBoardV2: boolean;
}

const STORAGE_KEY = 'gazeconnect_gaze_flags';

const DEFAULTS: GazeFlags = {
  dwellPauseOnGap: true,
  lockBreakProgressRetention: true,
  browserProgressRetention: true,
  browserGapPause: true,
  // toggleCalmFrontend: DEFAULT ON since 2026-07-07. The patient reported the
  // gaze toggle "magnetism is very very strong" across multiple sessions and
  // that the keys ABOVE the toggle get mistakenly selected when reaching for
  // it — both are the 220px/0.36 capture halo overlapping the top-row keys.
  // The calm (150px/0.28, no teleport, standard onset, 1450ms dwell) shrinks
  // that halo and softens the capture. SAFE for gaze-OFF recovery: every calm
  // change in GazeCursor is gated on `&& enabled` (gaze ON) and the gaze-OFF
  // toggle assist stays 140px/0.18 regardless of this flag. Revert instantly:
  //   window.__gazeFlags.set('toggleCalmFrontend', false)
  toggleCalmFrontend: true,
  // homeSnapCalm: still OFF until validated on the rig. Turn on with:
  //   window.__gazeFlags.set('homeSnapCalm', true)
  homeSnapCalm: false,
  browserProgressBank: false,
  // keyboardCadence + repeatGuard: DEFAULT ON since 2026-07-07. The patient
  // reported the wait before the dwell ring appears on the next key felt
  // sluggish — it was ~1.4s post-click cooldown + 250ms onset of pure dead
  // time. These cut that dead time (per-stage onset+cooldown, dwell UNCHANGED)
  // so typing feels snappy at zero accuracy cost; repeatGuard ships with it to
  // keep the faster cooldown from enabling accidental repeats. Revert with:
  //   window.__gazeFlags.set('keyboardCadence', false)  // restores today's timing
  keyboardCadence: true,
  repeatGuard: true,
  // Keyboard plan B3 — OFF until validated on the rig:
  //   window.__gazeFlags.set('zoneBoardV2', true)
  zoneBoardV2: false,
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
