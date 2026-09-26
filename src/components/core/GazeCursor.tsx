// =============================================
// GazeCursor.tsx - v18 TARGET-CENTRED GAZE BUBBLE (on v10 accuracy/onset/TTL)
// =============================================
// Key improvements:
// 1. Screen-to-window coordinate transformation
// 2. Backend GravityWell provides 3-zone stabilization
// 3. Frontend smoothing reduced — trust backend stability
// 4. Multi-point hit test for dwell detection
// 5. Proper DPI awareness
// 6. v10: Onset delay prevents drive-by activations (OptiKey-inspired)
// 7. v10: Incomplete fixation TTL preserves progress during brief gaze excursions
// 8. v10: Center-weighted keyboard hit zone expansion
// 9. v18: the cursor is a Tobii-style bubble drawn at the centre of the target
//    the eyes are on, moving centre to centre (utils/gazeFocus)
// =============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWS } from '../../hooks/useWebSocket';
import { useGazeControl, POST_NAVIGATION_COOLDOWN_MS } from './GazeControlToggle';
import { useRealGaze } from '../../contexts/RealGazeContext';
import { useCustomization } from '../../contexts/CustomizationContext';
import { useDwellTime } from '../../contexts/DwellTimeContext';
import { collectSnapTargets, computeSnap, type SnapTarget } from '../../utils/gazeSnapping';
import { computeEdgeExpansion, isPointInExpandedRect } from '../../utils/edgeHitZone';
import { computeScreenProfile } from '../../utils/screenProfile';
import { useTheme } from '../../contexts/ThemeContext';
import { collectKeyboardKeys, distanceToRect, findBestKeyboardKey, isCloserTarget, type KeyRect } from '../../utils/hitZoneExpansion';
import { BubbleMotion, FreeAnchor, GazeFocus, rectCentre, type Point } from '../../utils/gazeFocus';
import { DwellProgressBank } from '../../utils/dwellProgressBank';
import { recordDwellEvent, recordDwellInterrupt, recordFreeze, recordGazeLatency, type GazeLatencySample } from '../../utils/gazeTelemetry';
import { gazeFlags } from '../../utils/gazeFlags';
import { GazeFreshness, GAZE_RECOVERY_MS, GAZE_STALE_MS } from '../../utils/gazeSafety';
import { TrackerStatusNotice } from './TrackerStatusNotice';
import {
  FAMILIAR_KEYBOARD_TIMING, KEYBOARD_CADENCE_BY_STAGE, KEYBOARD_CADENCE_DEFAULT,
  dwellForContext, fixedDwell, normalizeKeyboardFeel, type KeyboardCadence,
} from '../../config/dwellTimeConfig';

type FamiliarKeyboardTarget = 'key' | 'modifier' | 'suggestion';
/** Only the ordinary keyboard keys and its suggestion slots use Familiar timing. */
function familiarKeyboardTarget(el: HTMLElement, onKeyboardScreen: boolean): FamiliarKeyboardTarget | null {
  if (!onKeyboardScreen) return null;
  if (el.matches('.keyboard-screen .keyboard-key')) {
    if (el.getAttribute('data-gaze-context') !== 'keyboard') return null;
    return el.getAttribute('data-action') === 'shift' ? 'modifier' : 'key';
  }
  if (el.getAttribute('data-gaze-context') === 'prediction'
      && (el.matches('.keyboard-screen .keyboard-word-slot')
        || el.matches('.keyboard-screen .keyboard-phrase-slot'))) return 'suggestion';
  return null;
}

// Match native pointer hit testing: an opaque/noninteractive surface blocks targets
// below it. The rendered gaze cursor is decorative and must never block its target.
function topGazeElementAtPoint(px: number, py: number): Element | null {
  return document.elementsFromPoint(px, py).find(el => !el.closest('[data-cursor="true"]')) || null;
}

// Revalidate cached snap/sticky targets after modal or readiness changes. A target
// can remain connected while its screen is covered or gaze selection is disarmed.
function isGazeTargetAvailable(target: HTMLElement): boolean {
  if (!target.isConnected || target.closest('[data-gaze="false"], [inert]') ||
      target.matches(':disabled, [aria-disabled="true"]')) return false;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const top = topGazeElementAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return Boolean(top && target.contains(top));
}

// Within this distance of a target's box the gaze still reads as being at it.
const NEAR_TARGET_PX = 40;
function isNearElement(el: HTMLElement, x: number, y: number, pad: number = NEAR_TARGET_PX): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}
type Candidate = { element: HTMLElement | null; isToggle: boolean; isAlwaysActive: boolean };
const NO_CANDIDATE: Candidate = { element: null, isToggle: false, isAlwaysActive: false };

// === TUNING PARAMETERS ===
// The gaze bubble: a light ring with a clear centre, modelled on Tobii
// Experience's "Preview my gaze" (about 150 px across at 1920 px). The outer
// diameter is a share of the window width kept within [min, max] CSS px, so it
// scales from 13" to 27" screens: 108 px at 1920 px for the default size.
const CURSOR_SIZES: Record<string, { share: number; min: number; max: number }> = {
  small: { share: 0.044, min: 64, max: 96 },
  medium: { share: 0.056, min: 80, max: 124 },
  large: { share: 0.071, min: 100, max: 156 },
};
function bubbleSize(setting: string): number {
  const s = CURSOR_SIZES[setting] || CURSOR_SIZES.medium;
  return Math.round(Math.min(s.max, Math.max(s.min, window.innerWidth * s.share)));
}
// Ring width as a share of the diameter (7 px at 108 px).
const BUBBLE_RING_SHARE = 0.065;
// A non-keyboard target is acquired from at most this far outside its box
// (keyboard keys: KEYBOARD_SNAP_MARGIN). Small controls are limited sooner by
// their centre-based range; this bounds the large cards.
const SNAP_EDGE_REACH_PX = 60;
// A target that has only just taken the focus is credited the samples that
// confirmed it (utils/gazeFocus FOCUS_CONFIRM_MS) if its onset starts within
// this long of that decision, so deciding the target first never lengthens the
// time to select. A later start (after a cooldown, say) begins at that moment.
const ONSET_CREDIT_WINDOW_MS = 50;
const DWELL_TIME = 1000;         // v10: 1.0s base dwell (was 0.7s) — less overwhelming for Papa
const CLICK_COOLDOWN = 1300;     // v10: 1.3s cooldown (was 0.9s) — prevents rapid re-fire
const TOGGLE_LOCKOUT_MS = 2500;  // v10: ignore toggle for 2.5s after any toggle fires
// A caregiver clicking a control usually LOOKS at it too, so a gaze dwell is
// running on the very control under the mouse. Without arbitration one press
// typed the letter twice. A physical press therefore abandons any dwell and
// starts the usual cooldown, and a physical click on a control that gaze
// pressed within this window is the same intention, not a second one.
const DUPLICATE_INPUT_MS = 500;
// Acquire the display lock after 10% of the configured dwell duration.
// This is GazeConnect behavior, not an OptiKey default or a hardware accuracy claim.
const LOCK_THRESHOLD = 0.10;
// The lock is also what lets gaze LEAVE a target: the release test runs only
// once locked, and until then the cursor is pinned and hit-tested on the target
// itself. As a fraction of the dwell, that came later with every slower timing
// set (250 ms of a 2500 ms dwell) and the cursor would not follow the eyes off
// a key. 50 ms is what the original 500 ms typing dwell gave.
const LOCK_AFTER_MS = 50;
const LOCK_BREAK_DISTANCE = 80;  // px to break lock — easier escape since backend handles stickiness
// Leaving a locked selection is judged on the RAW sample, which the backend
// estimator never smooths. One wild sample is not a look-away: near the bottom
// of the screen the raw stream flashes somewhere and straight back ~120 times a
// minute (live recording, 21 Sep 2026), and each flash broke the lock, flipping
// the locked cursor for a frame and sometimes starting a neighbour's onset. A
// look-away is taken once the gaze has stayed away this long by the tracker's
// clock (the third consecutive sample at 33 Hz). From the first away sample the
// ring stops filling, so the wait can never complete a selection the user is
// looking away from.
const LOCK_BREAK_CONFIRM_MS = 45;

// === ONSET DELAY (OptiKey-inspired two-phase fixation) ===
// Phase 1: Cursor must remain on the SAME element for ONSET_DELAY_MS before dwell begins.
// Prevents "drive-by" activations when cursor passes through keys en route to intended target.
const ONSET_DELAY_MS = 250;                // Default onset delay (ms) — matches GazeButton's onsetDelay
const ONSET_DELAY_ALWAYS_ACTIVE_MS = 100;  // Shorter onset for emergency/toggle buttons

// === INCOMPLETE FIXATION TTL (OptiKey-inspired progress recovery) ===
// When gaze briefly leaves a key (tracker noise, ALS tremor), preserve dwell progress.
// If user looks back at SAME element within TTL, resume from saved progress.
const FIXATION_TTL_MS = 1000;       // Time to preserve incomplete progress (ms)
const FIXATION_TTL_MIN_PROGRESS = 0.05;  // Minimum progress to save (below this, reset to 0)
// v18.1: progress is banked PER TARGET for FIXATION_TTL_MS (utils/dwellProgressBank),
// so looking at a neighbour no longer throws away what this one had reached.
// It is only handed back once the RAW gaze is on the target again, within its
// box grown by this much: the estimate alone lags, and a ring must never creep
// on while the eyes are somewhere else.
const RESUME_RAW_TOLERANCE_PX = 45;

// === KEYBOARD HIT ZONE EXPANSION ===
// v15: Increased from 15 to 35 — now primary selection mechanism (not fallback)
// v17.8: 35 → 55 px to fix loop on left/right edge keys (A, Z, P, ?) where
// raw-gaze noise routinely exceeds 35 px outside the rect. Still safely
// under the ~100 px inter-key spacing so adjacent keys win disambiguation.
const KEYBOARD_SNAP_MARGIN = 55;    // px beyond visual bounds for keyboard keys

// Velocity-adaptive smoothing — tuned for calm, stable movement
// v14: All alphas reduced for smoother, less overshooting cursor
const ENABLE_DUAL_PULL_REDUCTION = true;
const BACKEND_MAGNET_ACTIVE_PX = 0.8;
const RAW_SACCADE_BYPASS_PX = 34;
const SNAP_BYPASS_MS = 140;
const ON_KEY_RELEASE_BYPASS_MS = 120;
const NOISE_THRESHOLD = 3;       // < 3px = noise
const SLOW_THRESHOLD = 15;       // < 15px = fixation range
const FAST_THRESHOLD = 50;       // > 50px = saccade
const ALPHA_NOISE = 0.20;        // light jitter smoothing
const ALPHA_SLOW = 0.35;         // moderate convergence during fixation
const ALPHA_NORMAL = 0.55;       // medium transition response
const ALPHA_FAST = 0.85;         // near-raw for saccades

// === DWELL PAUSE-ON-GAP (flag: gazeFlags.dwellPauseOnGap, default ON since the 2026-06-11 on-rig A/B) ===
// When enabled, dwell/onset timers freeze (never reset, never advance) while
// gaze is stale or the backend reports blink/oob/frozen. 150ms matches the
// backend's POINT_TTL_SECONDS / FRAME_GAP_HOLD_SECONDS.
const DWELL_PAUSE_STALE_MS = 150;
// Freeze instrumentation threshold — episodes longer than this are recorded
// to window.__gazeTelemetry (acceptance criterion: none >200ms in normal use).
const FREEZE_RECORD_MS = 200;

// Edge proximity for interruption telemetry — same 80px definition the
// sticky-target logic uses for "edge button".
const isRectNearEdge = (rect: { left: number; top: number; right: number; bottom: number }): boolean => (
  rect.left < 80
  || rect.top < 80
  || rect.right > window.innerWidth - 80
  || rect.bottom > window.innerHeight - 80
);

// Anti-jitter stabilization zone.
// v17: Widened 4 → 8 px. Tobii ET5 noise floor on ALS gaze is routinely
// 10–20 px even at the center of the track box; a 4 px freeze zone
// almost never engages once the user is dwelling, so the cursor stays
// "alive" and visibly trembles around the button center. 8 px is still
// well inside a 60+ px card / key and lets the cursor settle visibly
// once dwell starts.
const STABLE_ZONE = 8;           // stronger anti-jitter freeze zone

export const GazeCursor: React.FC = () => {
  const ws = useWS();
  const gazeControl = useGazeControl();
  const { hasRealGaze, reportGazeReceived } = useRealGaze();
  const { settings } = useCustomization();
  // Read a primitive in the frame loop. A settings change takes effect without
  // closing over an old profile or allocating on each gaze sample.
  const keyboardFeelRef = useRef(normalizeKeyboardFeel(settings.keyboardFeel));
  keyboardFeelRef.current = normalizeKeyboardFeel(settings.keyboardFeel);
  const { settings: dwellSettings, currentStage } = useDwellTime();
  const dwellSettingsRef = useRef(dwellSettings);
  useEffect(() => { dwellSettingsRef.current = dwellSettings; }, [dwellSettings]);
  // Current ALS stage, read live in the frame loop for the keyboardCadence flag.
  const currentStageRef = useRef(currentStage);
  useEffect(() => { currentStageRef.current = currentStage; }, [currentStage]);
  // Keyboard cadence row for the active stage, or null when the flag is OFF
  // (in which case every keyboard timing stays exactly as today).
  const getKeyboardCadence = useCallback((): KeyboardCadence | null => {
    if (!gazeFlags.keyboardCadence) return null;
    const st = currentStageRef.current;
    return (st && KEYBOARD_CADENCE_BY_STAGE[st]) || KEYBOARD_CADENCE_DEFAULT;
  }, []);
  const lastNavigationTimestampRef = useRef(gazeControl.lastNavigationTimestamp);
  useEffect(() => {
    lastNavigationTimestampRef.current = gazeControl.lastNavigationTimestamp;
  }, [gazeControl.lastNavigationTimestamp]);
  const CURSOR_SIZE = bubbleSize(settings.gazeCursorSize);
  // The bubble is optional. While a selection is dwelling it sits at that
  // target's centre and carries the progress ring, so it always shows then:
  // that ring is what lets the user look away in time to cancel.
  const showRoamingCursor = settings.showGazeCursor !== false;
  const { isLight, isWarm } = useTheme();
  const isMouseMode = gazeControl.isMouseMode;

  // v17.18: cursor position is written straight to the DOM element via
  // cursorElRef + transform — it is NOT React state. setX/setY used to run
  // on every gaze frame (66Hz), scheduling a full reconciliation of this
  // component (ring SVG, dot, highlight, status bar) per frame; rAF-stall
  // telemetry pointed here. React renders (triggered by dwellProgress etc.)
  // re-derive the same transform from posRef, so the two writers can never
  // disagree.
  const cursorElRef = useRef<HTMLDivElement | null>(null);
  const applyCursorTransform = useCallback((px: number, py: number) => {
    const el = cursorElRef.current;
    if (el) {
      // translate(-50%,-50%) centers the element regardless of CURSOR_SIZE.
      el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
    }
  }, []);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [targetName, setTargetName] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);
  const [msgsPerSec, setMsgsPerSec] = useState(0);

  // v16: Visual selection highlight — rectangular border around the element being dwelled on.
  // Provides psychological stability: even if cursor moves slightly, the highlight stays
  // fixed on the correct element, matching Grid 3 / Tobii Communicator / TD Snap behavior.
  const [highlightRect, setHighlightRect] = useState<{
    left: number; top: number; width: number; height: number; keyboardKey: boolean;
  } | null>(null);

  // No usable gaze for GAZE_RECOVERY_MS, or none yet: the bubble is hidden.
  // When gaze returns it is placed afresh once its target is decided: never a
  // glide from a stale spot, never a recentring after it has appeared.
  const [gazeAbsent, setGazeAbsent] = useState(true);
  const gazeAbsentRef = useRef(true);

  // Refs for high-performance updates
  // posRef: where the bubble is DRAWN (display loop, drawBubble). estRef: the
  // gaze estimate itself (backend x/y after the legacy smoothing in
  // handleGaze). Targets are decided on the estimate, never on the drawn
  // bubble, which rests at a target's centre.
  const posRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const estRef = useRef<Point>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const lockPosRef = useRef({ x: 0, y: 0 });
  // Tracker time (ms) of the first raw sample away from a locked target, 0 when
  // none is pending (see LOCK_BREAK_CONFIRM_MS).
  const lockAwaySinceRef = useRef(0);
  // The target the eyes are on (with hysteresis), the bubble's spring, and
  // where the bubble rests while no target has the focus (utils/gazeFocus).
  const focusRef = useRef(new GazeFocus<HTMLElement>());
  const bubbleRef = useRef(new BubbleMotion());
  const freeAnchorRef = useRef(new FreeAnchor());
  const lastDrawAtRef = useRef(0);
  const drawnRef = useRef({ x: NaN, y: NaN });
  const dwellTargetRef = useRef<HTMLElement | null>(null);
  const dwellStartTimeRef = useRef<number>(0);
  const lastClickTimeRef = useRef<number>(0);
  const lastGazeActivationRef = useRef<{ element: HTMLElement; at: number } | null>(null);
  const frameRef = useRef<number>(0);
  const msgCountRef = useRef(0);
  const lastSecRef = useRef(Date.now());
  const isLockedRef = useRef(false);
  const lastRawPointRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2, t: Date.now() });
  const suppressPullUntilRef = useRef(0);
  const prevBackendOnKeyRef = useRef(false);

  // === DWELL PAUSE-ON-GAP + FREEZE INSTRUMENTATION REFS ===
  // lastGazeFrameAtRef: wall-clock time of the last WS gaze frame (0 = none yet).
  // lastSignalStateRef: backend SignalConditioner state of the latest frame
  //   ('valid' | 'blink' | 'oob' | 'frozen' | 'lost'; missing field = 'valid').
  // lastDwellTickRef: previous dwellFrame timestamp, for pause time-shifting
  //   and rAF-stall detection.
  const lastGazeFrameAtRef = useRef<number>(0);
  const lastSignalStateRef = useRef<string>('valid');
  const lastDwellTickRef = useRef<number>(0);
  const freshnessRef = useRef(new GazeFreshness());

  // === LATENCY INSTRUMENTATION REFS (measurement only) ===
  // lastTHelperMsRef dedupes gap-hold rebroadcasts (same helper stamp);
  // latencyPaintCounterRef samples the paint delta every 8th frame;
  // lastLatencySampleRef lets the sampled rAF fill paintMs into the ring
  // entry after the fact.
  const lastTHelperMsRef = useRef<number>(0);
  const latencyPaintCounterRef = useRef<number>(0);
  const lastLatencySampleRef = useRef<GazeLatencySample | null>(null);

  // v15: OptiKey-style 3-sample pre-smoothing (SmoothWhenChangingGazeTarget)
  // Reduces directional bias before EMA amplifies it.
  // Weights: current=0.45, prev1=0.30, prev2=0.25
  const preSmoothPrev1Ref = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const preSmoothPrev2Ref = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const preSmoothInitRef = useRef(false);

  // Snap targets for semantic snapping (refreshed every 500ms)
  const snapTargetsRef = useRef<SnapTarget[]>([]);
  const gazeStateRef = useRef<string | undefined>(undefined);
  const screenProfileRef = useRef(computeScreenProfile());
  const isKeyboardScreenRef = useRef(false);
  const isCompassScreenRef = useRef(false);
  // The keyboard alone shows a stationary acquisition outline during onset.
  // Change the attribute only when the target changes, never on gaze samples.
  const keyboardOnsetVisualRef = useRef<HTMLElement | null>(null);
  const setKeyboardOnsetVisual = useCallback((target: HTMLElement | null) => {
    if (keyboardOnsetVisualRef.current === target) return;
    keyboardOnsetVisualRef.current?.removeAttribute('data-keyboard-onset');
    keyboardOnsetVisualRef.current = null;
    if (target && isKeyboardScreenRef.current && target.matches('.keyboard-screen .keyboard-key')) {
      target.setAttribute('data-keyboard-onset', 'true');
      keyboardOnsetVisualRef.current = target;
    }
  }, []);
  const keyboardConfirmVisualRef = useRef<HTMLElement | null>(null);
  const keyboardConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearKeyboardConfirmation = useCallback(() => {
    if (keyboardConfirmTimerRef.current !== null) clearTimeout(keyboardConfirmTimerRef.current);
    keyboardConfirmTimerRef.current = null;
    keyboardConfirmVisualRef.current?.removeAttribute('data-keyboard-confirmed');
    keyboardConfirmVisualRef.current = null;
  }, []);
  const confirmKeyboardSelection = useCallback((target: HTMLElement) => {
    clearKeyboardConfirmation();
    if (!isKeyboardScreenRef.current || !target.matches('.keyboard-screen .keyboard-key')) return;
    target.setAttribute('data-keyboard-confirmed', 'true');
    keyboardConfirmVisualRef.current = target;
    // Confirmation is paint only. The click fires on its original frame.
    keyboardConfirmTimerRef.current = setTimeout(clearKeyboardConfirmation, 220);
  }, [clearKeyboardConfirmation]);

  // Toggle lockout: prevent double-fire by requiring look-away + cooldown
  const lastToggleTimeRef = useRef<number>(0);
  const toggleLookedAwayRef = useRef(true);

  // === ONSET DELAY REFS ===
  // Track when cursor first entered current target — dwell only starts after onset completes
  const onsetStartTimeRef = useRef<number>(0);
  const onsetTargetRef = useRef<HTMLElement | null>(null);
  const onsetCompletedRef = useRef(false);

  // === INCOMPLETE FIXATION TTL REFS ===
  // Save progress when gaze leaves a target so it can be resumed
  const savedDwellRef = useRef<{
    element: HTMLElement;
    progress: number;
    timestamp: number;
  } | null>(null);
  // v17.6 Option A: visual continuity expiry. When savedDwellRef is set,
  // the dwell circle + highlight stay visible (don't reset to 0) until
  // either gaze returns (resume) OR this timestamp passes (hard clear).
  const savedDwellExpiryRef = useRef<number>(0);
  // v18.1: what every recently left target had reached (utils/dwellProgressBank).
  const progressBankRef = useRef(new DwellProgressBank<HTMLElement>());
  // The live ring, readable from handleGaze: a selection already under way
  // resists being taken over by a neighbour (gazeFocus commitment).
  const dwellProgressRef = useRef(0);

  // B1 keyboardCadence: whether the previous click was a keyboard-context
  // target — gates the keyboard cooldown base for the next click's cooldown.
  const lastClickWasKeyboardRef = useRef<boolean>(false);

  // === KEYBOARD HIT ZONE REFS ===
  const keyboardKeysRef = useRef<KeyRect[]>([]);

  // Window bounds for coordinate mapping
  const windowBoundsRef = useRef<{
    x: number; y: number; width: number; height: number;
    screenWidth: number; screenHeight: number; scaleFactor: number;
    isFullScreen: boolean; isMaximized: boolean;
  } | null>(null);

  const enabled = gazeControl.isGazeEnabled;

  // Poll window bounds periodically for coordinate mapping
  useEffect(() => {
    const updateBounds = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.getWindowBounds) {
          const bounds = await api.getWindowBounds();
          // v10: Reject poisoned bounds — Windows reports (-32000, -32000) during
          // minimize/transition, which pushes cursor off-screen via coordinate transform.
          if (bounds && bounds.x > -10000 && bounds.y > -10000) {
            windowBoundsRef.current = bounds;
          }
        }
      } catch (e) { /* silently continue - browser mode */ }
    };
    updateBounds();
    const interval = setInterval(updateBounds, 2000); // Update every 2s
    return () => clearInterval(interval);
  }, []);

  // Send gaze offset to backend when settings change.
  // The `ws` context object is rebuilt on every provider render (each
  // predictions update), so this effect re-runs constantly — the ref gate
  // ensures we only actually SEND when the offset values change or the
  // connection re-establishes (backend resets offset to 0 on restart).
  // Without the gate this spammed set_gaze_offset many times per second
  // (observed live in the 2026-06-11 session logs as [GAZE-OFFSET] floods).
  const lastSentOffsetRef = useRef<{ x: number; y: number; connected: boolean } | null>(null);
  useEffect(() => {
    const offsetX = settings.gazeOffsetX ?? 0;
    const offsetY = settings.gazeOffsetY ?? 0;
    const prev = lastSentOffsetRef.current;
    if (prev && prev.x === offsetX && prev.y === offsetY && prev.connected === ws.isConnected) {
      return;
    }
    if (ws.setGazeOffset) {
      ws.setGazeOffset(offsetX, offsetY);
      lastSentOffsetRef.current = { x: offsetX, y: offsetY, connected: ws.isConnected };
    }
  }, [settings.gazeOffsetX, settings.gazeOffsetY, ws]);

  // Refresh snap targets and screen profile periodically.
  // v11: Also register targets with backend for magnetism + on_key detection.
  // Without this, backend dwell_manager has ZERO targets → magnetism pulls
  // toward nothing, on_key=False always → Zone 1 never activates.
  const lastRegisteredRef = useRef<string>('');
  // Ref for registerTargets to avoid useEffect churn (ws object recreated every render)
  const registerTargetsRef = useRef(ws.registerTargets);
  useEffect(() => { registerTargetsRef.current = ws.registerTargets; });

  // v11: Force re-registration when screen changes (new DOM = new targets)
  useEffect(() => {
    lastRegisteredRef.current = '';
  }, [ws.currentScreen]);

  useEffect(() => {
    const refresh = () => {
      const targets = collectSnapTargets();
      snapTargetsRef.current = targets;
      screenProfileRef.current = computeScreenProfile();
      // Refresh keyboard key rects for center-weighted hit zone expansion
      if (isKeyboardScreenRef.current) {
        keyboardKeysRef.current = collectKeyboardKeys();
      }

      // Register with backend (deduplicated by content hash to avoid spam)
      const hash = targets.map(t =>
        `${t.id}:${t.rect.left.toFixed(0)},${t.rect.top.toFixed(0)},${t.rect.width.toFixed(0)},${t.rect.height.toFixed(0)}`
      ).join('|');
      if (hash !== lastRegisteredRef.current && registerTargetsRef.current) {
        lastRegisteredRef.current = hash;
        const backendTargets = targets.map(t => ({
          id: t.id,
          x: t.rect.left + t.rect.width / 2,
          y: t.rect.top + t.rect.height / 2,
          width: t.rect.width,
          height: t.rect.height,
          size: 'md',
          context: t.element?.getAttribute('data-gaze-context')
            || (t.priority >= 3 ? 'gazetoggle' : (isKeyboardScreenRef.current ? 'keyboard' : 'navigation')),
          priority: t.priority,
          enabled: true,
        }));
        registerTargetsRef.current(backendTargets);
      }
    };
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, []); // Stable — ref keeps registerTargets current

  // v9: Track keyboard screen for context-aware dwell timing
  // v10: Also track compass/advanced-map screens for nav dwell boost
  useEffect(() => {
    setKeyboardOnsetVisual(null);
    clearKeyboardConfirmation();
    isKeyboardScreenRef.current = ws.currentScreen === 'keyboard';
    isCompassScreenRef.current = ws.currentScreen === 'compass-map' || ws.currentScreen === 'advanced-map';
  }, [ws.currentScreen, setKeyboardOnsetVisual, clearKeyboardConfirmation]);
  useEffect(() => () => {
    setKeyboardOnsetVisual(null);
    clearKeyboardConfirmation();
  }, [setKeyboardOnsetVisual, clearKeyboardConfirmation]);

  // Find gaze toggle element
  const isGazeToggleElement = useCallback((el: HTMLElement | null): boolean => {
    if (!el) return false;
    let check: HTMLElement | null = el;
    let depth = 0;
    while (check && depth < 10) {
      if (check.getAttribute('data-gaze-toggle') === 'true' ||
        check.id === 'gaze-toggle-button' ||
        check.className?.includes?.('gaze-toggle')) {
        return true;
      }
      check = check.parentElement;
      depth++;
    }
    return false;
  }, []);

  // v9: Enhanced always-active detection — Bootstrap paradox fix
  // ENABLEGAZE, Gaze Toggle, and Emergency buttons must respond even when gaze is OFF
  const isAlwaysActiveElement = useCallback((el: HTMLElement | null): boolean => {
    if (!el) return false;
    let check: HTMLElement | null = el;
    let depth = 0;
    while (check && depth < 10) {
      if (check.getAttribute('data-gaze-always') === 'true' ||
        check.getAttribute('data-always-active') === 'true' ||
        check.getAttribute('data-gaze-toggle') === 'true' ||
        check.id === 'gaze-toggle-button' ||
        check.id === 'gaze-toggle-nav' ||
        check.id === 'footer-gaze' ||
        check.className?.includes?.('gaze-toggle')) {
        return true;
      }
      check = check.parentElement;
      depth++;
    }
    return false;
  }, []);

  // Inspect only the top painted element and its ancestors; never click through
  // a dialog background, an unready choice, or a disabled button to a lower layer.
  const findClickableElement = useCallback((px: number, py: number): { element: HTMLElement | null; isToggle: boolean; isAlwaysActive: boolean } => {
    const top = topGazeElementAtPoint(px, py);
    let check: HTMLElement | null = top instanceof HTMLElement ? top : top?.parentElement || null;
    let depth = 0;
    while (check && depth < 15) {
      if (check.closest('[data-gaze="false"], [inert]') || check.matches(':disabled, [aria-disabled="true"]')) break;
      const tag = check.tagName.toLowerCase();
      const className = check.className;
      const isClickable = tag === 'button' || tag === 'a' || check.getAttribute('role') === 'button' ||
        check.getAttribute('data-gaze') === 'true' || check.getAttribute('data-gaze-toggle') === 'true' ||
        (typeof className === 'string' && (className.includes('gaze-button') || className.includes('gaze-card')));
      if (isClickable) {
        const isToggle = isGazeToggleElement(check);
        return { element: check, isToggle, isAlwaysActive: isToggle || isAlwaysActiveElement(check) };
      }
      check = check.parentElement;
      depth++;
    }
    return { element: null, isToggle: false, isAlwaysActive: false };
  }, [isGazeToggleElement, isAlwaysActiveElement]);

  const getTargetAttr = useCallback((el: HTMLElement | null, attr: string): string | null => {
    let check: HTMLElement | null = el;
    let depth = 0;
    while (check && depth < 8) {
      const v = check.getAttribute(attr);
      if (typeof v === 'string') return v;
      check = check.parentElement;
      depth++;
    }
    return null;
  }, []);

  // Dwell detection frame loop
  // Helper: compute effective dwell time for a target element
  const _getEffectiveDwell = useCallback((
    el: HTMLElement,
    contextKey: string,
    s: typeof dwellSettingsRef.current,
    isToggle: boolean,
    isKeyboard: boolean,
    isCompass: boolean,
    getAttr: (el: HTMLElement | null, attr: string) => string | null
  ): number => {
    if (keyboardFeelRef.current === 'familiar') {
      const familiarTarget = familiarKeyboardTarget(el, isKeyboard);
      if (familiarTarget) return FAMILIAR_KEYBOARD_TIMING[familiarTarget];
    }
    const explicitDwellRaw = getAttr(el, 'data-gaze-dwell-ms') || getAttr(el, 'data-gaze-dwell');
    const explicitDwell = explicitDwellRaw ? Number(explicitDwellRaw) : NaN;

    const contextDwell = isToggle ? s.gazeToggle : contextKey
      ? dwellForContext(contextKey) : isKeyboard ? s.keyboardKey : s.standardButton;
    return fixedDwell(explicitDwell, contextDwell);

  }, []);

  // v18.1: the progress this target had before the eyes left it, but only once
  // the RAW gaze is back on it (within RESUME_RAW_TOLERANCE_PX of its box).
  // The estimate alone lags behind by a sample or two, and a ring must never
  // continue while the eyes are somewhere else. Taking it also clears it.
  const takeBankedProgress = useCallback((el: HTMLElement, now: number): number | null => {
    const raw = lastRawPointRef.current;
    if (!isNearElement(el, raw.x, raw.y, RESUME_RAW_TOLERANCE_PX)) return null;
    return progressBankRef.current.take(el, now);
  }, []);

  const resetSelection = useCallback(() => {
    setKeyboardOnsetVisual(null);
    clearKeyboardConfirmation();
    dwellTargetRef.current = null;
    dwellStartTimeRef.current = 0;
    onsetTargetRef.current = null;
    onsetStartTimeRef.current = 0;
    onsetCompletedRef.current = false;
    savedDwellRef.current = null;
    savedDwellExpiryRef.current = 0;
    progressBankRef.current.clear();
    dwellProgressRef.current = 0;
    isLockedRef.current = false;
    lockAwaySinceRef.current = 0;
    preSmoothInitRef.current = false;
    setDwellProgress(0);
    setIsLocked(false);
    setTargetName('');
    setHighlightRect(null);
  }, [setKeyboardOnsetVisual, clearKeyboardConfirmation]);

  // === v18: THE TARGET UNDER A POINT OF THE GAZE ESTIMATE ================
  // Before any hysteresis. Moved here from the dwell loop, rules unchanged:
  // keyboard keys by containment then nearest edge, other targets likewise
  // within their reach, then a small multi-point hit test. The v17.8 sticky
  // tolerances now live in GazeFocus's margins (utils/gazeFocus).
  const pickCandidate = useCallback((cx: number, cy: number): Candidate => {
    // Multi-point hit test: check center + 4 nearby points
    // v11: Larger offset for always-active elements (gaze toggle buttons are hard to reach)
    // v17.5: Widened the "actively-dwelling" radius from 35 → 70 px. This
    // is the structural fix for the dwell-circle restart loop at corner
    // buttons (Word / Quick Words / Show Nav / 123 / "what") — those
    // sit where the backend GravityWell switches to EDGE_MODE and stops
    // smoothing, so raw gaze can be 30–80 px off the button rect for
    // several frames. A wider hit test catches those excursions without
    // a separate sticky-tolerance layer that holds the WRONG target
    // during real transitions (the regression in v17.4). Hit test still
    // returns the FIRST element found, so adjacent buttons that the
    // user is genuinely moving to still win the race.
    // v18: while dwelling the focus's margins hold the target; the probe
    // itself stays small so a neighbour is only found where it really is.
    const HIT_OFFSET = 20;
    const TOGGLE_HIT_OFFSET = 64; // Extra-large for gaze toggles — they must be easy to hit
    const useToggleHit = !dwellTargetRef.current; // Only expand when not already dwelling
    const hitPoints = [
      { x: cx, y: cy },                          // center
      { x: cx - HIT_OFFSET, y: cy },             // left
      { x: cx + HIT_OFFSET, y: cy },             // right
      { x: cx, y: cy - HIT_OFFSET },             // up
      { x: cx, y: cy + HIT_OFFSET },             // down
      // v11: Extra hit points for gaze toggle reachability
      ...(useToggleHit ? [
        { x: cx - TOGGLE_HIT_OFFSET, y: cy },                       // far left
        { x: cx + TOGGLE_HIT_OFFSET, y: cy },                       // far right
        { x: cx - TOGGLE_HIT_OFFSET, y: cy - TOGGLE_HIT_OFFSET },  // top-left
        { x: cx + TOGGLE_HIT_OFFSET, y: cy - TOGGLE_HIT_OFFSET },  // top-right
        { x: cx - TOGGLE_HIT_OFFSET, y: cy + TOGGLE_HIT_OFFSET },  // bottom-left
        { x: cx + TOGGLE_HIT_OFFSET, y: cy + TOGGLE_HIT_OFFSET },  // bottom-right
        { x: cx, y: cy - TOGGLE_HIT_OFFSET },                       // far up
        { x: cx, y: cy + TOGGLE_HIT_OFFSET },                       // far down
      ] : []),
    ];

    let clickable: HTMLElement | null = null;
    let isToggle = false;
    let isAlwaysActive = false;

    // === v16: NEAREST-CENTER SELECTION (PRIMARY for ALL screens) ===
    // GazeConnect uses nearest-center disambiguation within eligible hit zones.
    // OptiKey uses rectangle containment; see docs/optikey-gaze-reference-review.md.
    // For keyboard: use dedicated keyboard key rects (more precise, tighter grid).
    // For other screens: use snap targets (all gaze-enabled buttons).
    //
    // v17: Overlay detection — if a full-screen overlay (e.g. QuickWordsOverlay, z-index >= 30)
    // is present, skip the keyboard-specific path and use snap targets instead.
    // Without this, overlay buttons are invisible to the keyboard hit zone collector
    // because they use data-gaze-context="quickfire" not "keyboard".
    const hasHighZOverlay = isKeyboardScreenRef.current && (() => {
      const topEl = document.elementFromPoint(cx, cy);
      if (!topEl) return false;
      // Walk up to find if we're inside a high-z overlay (z-index >= 20)
      let el: Element | null = topEl;
      while (el && el !== document.body) {
        const z = parseInt(getComputedStyle(el).zIndex || '0', 10);
        if (z >= 20 && el.getAttribute('data-gaze-context') !== 'keyboard') return true;
        el = el.parentElement;
      }
      return false;
    })();

    if (isKeyboardScreenRef.current && keyboardKeysRef.current.length > 0 && !hasHighZOverlay) {
      const bestKey = findBestKeyboardKey(cx, cy, keyboardKeysRef.current, KEYBOARD_SNAP_MARGIN);
      if (bestKey) {
        clickable = bestKey;
        isToggle = false;
        isAlwaysActive = false;
      }
    }
    // v17.8: Run snap-targets-nearest-center as a fallback even on keyboard
    // screen, so non-keyboard buttons like "Word", "Quick Words",
    // "Show Nav", "123", and the prediction strip get the same generous
    // nearest-center treatment as keys do. Previously these fell straight
    // through to the multi-point hit test with HIT_OFFSET=20 (tight),
    // causing onset to reset on every gaze excursion >20 px — exactly the
    // corner-button loop the patient described.
    if (!clickable && snapTargetsRef.current.length > 0) {
      // v16: Nearest-center for non-keyboard screens using snap targets.
      // Find the snap target whose center is closest to the cursor position.
      //
      // v17: When an overlay is detected (hasHighZOverlay), filter targets to only include
      // elements that are actually visible at their center — prevents selecting keyboard keys
      // hidden beneath the QuickWords overlay or other modal overlays.
      let bestDist = Infinity;
      let bestEdge = Infinity;
      let bestTarget: import('../../utils/gazeSnapping').SnapTarget | null = null;
      for (const target of snapTargetsRef.current) {
        const tcx = target.rect.left + target.rect.width / 2;
        const tcy = target.rect.top + target.rect.height / 2;

        // v17: Skip targets hidden behind overlays
        if (hasHighZOverlay && target.element) {
          const topEl = document.elementFromPoint(tcx, tcy);
          if (topEl && !target.element.contains(topEl) && !topEl.closest('[data-gaze-toggle]')) {
            continue; // This target is covered by an overlay element
          }
        }

        const dist = Math.hypot(cx - tcx, cy - tcy);
        // Only consider targets within a reasonable range (half of button diagonal + margin)
        // B1-FE extension: with gaze ON + calm flag, the TOGGLE gets no
        // extra acquisition margin — a ~140px toggle was acquirable from
        // ~129px away, which fed the capture-then-teleport the patient
        // reported. Its own rect (half-diagonal ≈ 99px) stays fully
        // reachable for intentional selection.
        const acquisitionMargin =
          (gazeFlags.toggleCalmFrontend && enabled && target.priority >= 3) ? 0 : 30;
        const maxRange = Math.hypot(target.rect.width, target.rect.height) * 0.5 + acquisitionMargin;
        // Within range, the target that CONTAINS the point wins, then the
        // nearest edge; centre distance only breaks ties. Centre distance
        // alone handed most of a wide target to its smaller neighbours.
        const edge = distanceToRect(cx, cy, target.rect);
        // v18: and never more than SNAP_EDGE_REACH_PX outside its box. The
        // centre-based range alone reached ~125 px past a large Home card; with
        // the bubble drawn at the chosen target's centre, that read as the
        // cursor being pulled onto a card the eyes were not on.
        if (dist < maxRange && edge <= SNAP_EDGE_REACH_PX && isCloserTarget(edge, dist, bestEdge, bestDist)
          && target.element && isGazeTargetAvailable(target.element)) {
          bestDist = dist;
          bestEdge = edge;
          bestTarget = target;
        }
      }
      if (bestTarget?.element) {
        // Verify this element is actually clickable (has data-gaze or is a button)
        const result = findClickableElement(
          bestTarget.rect.left + bestTarget.rect.width / 2,
          bestTarget.rect.top + bestTarget.rect.height / 2
        );
        if (result.element === bestTarget.element) {
          clickable = result.element;
          isToggle = result.isToggle;
          isAlwaysActive = result.isAlwaysActive;
        }
      }
    }

    // Fall back to multi-point hit test if nearest-center didn't find anything.
    if (!clickable) {
      // v11: Two-pass hit test. First 5 points (standard radius) match any element.
      // Extended points (6+) only count if they hit an always-active element (gaze toggle).
      for (let i = 0; i < hitPoints.length; i++) {
        const point = hitPoints[i];
        const result = findClickableElement(point.x, point.y);
        if (result.element) {
          // Extended hit points (index >= 5) only count for always-active elements
          if (i >= 5 && !result.isAlwaysActive) continue;
          // B1-FE extension: with gaze ON + calm flag, the extended ±64px
          // reach no longer applies to the TOGGLE (it kept acquiring the
          // toggle from ~90px out). Emergency keeps its extended reach,
          // and the toggle keeps it whenever gaze is OFF (bootstrap).
          if (i >= 5 && result.isToggle && gazeFlags.toggleCalmFrontend && enabled) continue;
          clickable = result.element;
          isToggle = result.isToggle;
          isAlwaysActive = result.isAlwaysActive;
          break;
        }
      }
    }

    return { element: clickable, isToggle, isAlwaysActive };
  }, [enabled, findClickableElement]);

  // === v18: DRAW THE BUBBLE (display clock) ===============================
  // At the centre of the focused target. While a new target is still being
  // confirmed the bubble waits where it is: it never heads for an unconfirmed
  // landing point and then turns to a centre. With no target it rests at the
  // free anchor. Every move is one spring glide (utils/gazeFocus BubbleMotion).
  // With no usable gaze for GAZE_RECOVERY_MS it is hidden; it reappears
  // directly at its decided place.
  const drawBubble = useCallback((now: number) => {
    const motion = bubbleRef.current;
    const focus = focusRef.current;
    if (!(freshnessRef.current.age(performance.now()) <= GAZE_RECOVERY_MS)) {
      if (!gazeAbsentRef.current) {
        gazeAbsentRef.current = true;
        setGazeAbsent(true);
      }
      focus.reset();
      freeAnchorRef.current.reset();
      motion.placed = false;
      lastDrawAtRef.current = now;
      return;
    }
    const target = focus.current;
    const rect = target && target.isConnected ? target.getBoundingClientRect() : null;
    let goal: Point;
    if (rect && rect.width > 0 && rect.height > 0) {
      goal = rectCentre(rect);
    } else if (focus.acquiring) {
      if (!motion.placed) { lastDrawAtRef.current = now; return; }   // Decide before showing.
      goal = { x: motion.x, y: motion.y };
    } else {
      goal = freeAnchorRef.current.point || estRef.current;
    }
    const dt = lastDrawAtRef.current > 0 ? now - lastDrawAtRef.current : 0;
    lastDrawAtRef.current = now;
    const p = motion.step(goal, dt);
    posRef.current = { x: p.x, y: p.y };
    if (p.x !== drawnRef.current.x || p.y !== drawnRef.current.y) {
      drawnRef.current = { x: p.x, y: p.y };
      applyCursorTransform(p.x, p.y);
    }
    if (gazeAbsentRef.current) {
      gazeAbsentRef.current = false;
      setGazeAbsent(false);
    }
  }, [applyCursorTransform]);

  const dwellFrame = useCallback(() => {
    const now = Date.now();

    // === FREEZE INSTRUMENTATION (always on, measurement only) ===
    // frameDt is also reused by the flagged pause-on-gap block below.
    const frameDt = lastDwellTickRef.current > 0 ? now - lastDwellTickRef.current : 0;
    lastDwellTickRef.current = now;
    if (frameDt > FREEZE_RECORD_MS) {
      try { recordFreeze('raf_stall', frameDt); } catch { /* never block the loop */ }
    }

    // The bubble is drawn on the display clock, whatever the dwell does below.
    drawBubble(now);

    // Mouse-Only Mode: no dwell detection at all
    if (isMouseMode) {
      setKeyboardOnsetVisual(null);
      clearKeyboardConfirmation();
      if (dwellTargetRef.current) {
        dwellTargetRef.current = null;
        dwellStartTimeRef.current = 0;
        setDwellProgress(0);
        setTargetName('');
        setIsLocked(false);
        isLockedRef.current = false;
        setHighlightRect(null);
      }
      frameRef.current = requestAnimationFrame(dwellFrame);
      return;
    }

    // No onset, hit-test, or click may run on invalid or stale input. Short
    // interruptions pause; a one-second loss expires progress in real time.
    // A stalled renderer must also not credit unobserved wall-clock time.
    const fresh = freshnessRef.current.allowsDwell(performance.now());
    if (!fresh || frameDt > GAZE_STALE_MS || frameDt < 0) {
      if (freshnessRef.current.age(performance.now()) > GAZE_RECOVERY_MS ||
          frameDt > GAZE_RECOVERY_MS || frameDt < 0) {
        resetSelection();
      } else {
        if (dwellStartTimeRef.current > 0) dwellStartTimeRef.current += Math.max(0, frameDt);
        if (onsetStartTimeRef.current > 0) onsetStartTimeRef.current += Math.max(0, frameDt);
      }
      frameRef.current = requestAnimationFrame(dwellFrame);
      return;
    }

    // Raw gaze has just left a locked target (handleGaze). Until it comes back
    // or the look-away is confirmed, the selection holds still: no progress.
    if (isLockedRef.current && lockAwaySinceRef.current > 0) {
      if (dwellStartTimeRef.current > 0) dwellStartTimeRef.current += Math.max(0, frameDt);
      frameRef.current = requestAnimationFrame(dwellFrame);
      return;
    }

    // Cooldown check — uses configurable cooldown from DwellTimeContext
    const s = dwellSettingsRef.current;
    // B1 keyboardCadence (default OFF): when the previous click was a keyboard
    // target, use the stage's keyboard cooldown base INSTEAD of the hidden
    // +1000ms floor — this is where most of the typing dead time hides. Only
    // applies to keyboard-after-keyboard clicks; every other cooldown (nav,
    // home, emergency, and the first click after leaving the keyboard) keeps
    // the +1000ms floor. With the flag OFF this is exactly today's value.
    const cadenceForCooldown = getKeyboardCadence();
    const effectiveCooldown = (cadenceForCooldown && lastClickWasKeyboardRef.current)
      ? cadenceForCooldown.cooldown
      : s.cooldownAfterActivation + 1000; // base 1000ms + configurable
    const inClickCooldown = now - lastClickTimeRef.current < effectiveCooldown;

    // === v18: THE DWELL TARGET IS THE FOCUSED TARGET (utils/gazeFocus) ====
    // handleGaze decides which target the eyes are on from the gaze estimate,
    // with hysteresis (pickCandidate + GazeFocus), and the bubble is drawn at
    // that target's centre, so what is shown is exactly what is selected
    // (v17.9's rule, kept). While the estimate is leaving the focused target
    // (a change being confirmed) nothing dwells: progress is saved, not
    // advanced.
    const focus = focusRef.current;
    let clickable: HTMLElement | null = focus.leaving ? null : focus.current;
    let isToggle = clickable ? isGazeToggleElement(clickable) : false;
    let isAlwaysActive = clickable ? (isToggle || isAlwaysActiveElement(clickable)) : false;

    // Every acquisition path (including keyboard and cached sticky targets) must
    // respect the currently visible layer and the current READY state.
    if (clickable && !isGazeTargetAvailable(clickable)) {
      clickable = null;
      isToggle = false;
      isAlwaysActive = false;
    }
    if (savedDwellRef.current && !isGazeTargetAvailable(savedDwellRef.current.element)) {
      savedDwellRef.current = null;
      savedDwellExpiryRef.current = 0;
    }

    // v10: Toggle lockout — if target is toggle and within lockout or user hasn't looked away, ignore it
    const toggleCandidate = Boolean(clickable && isToggle);
    if (!toggleCandidate && !toggleLookedAwayRef.current) {
      toggleLookedAwayRef.current = true;
    }
    if (clickable && isToggle) {
      const timeSinceToggle = now - lastToggleTimeRef.current;
      if (timeSinceToggle < TOGGLE_LOCKOUT_MS || !toggleLookedAwayRef.current) {
        clickable = null;
        isToggle = false;
        isAlwaysActive = false;
      }
    }
    // Navigation cooldown: freeze dwell for POST_NAVIGATION_COOLDOWN_MS after screen change
    // (Smart Pause mode). Skip freeze for always-active elements (toggle, emergency).
    const lastNavigationTimestamp = lastNavigationTimestampRef.current;
    const inNavCooldown = lastNavigationTimestamp > 0
      && Date.now() - lastNavigationTimestamp < POST_NAVIGATION_COOLDOWN_MS;

    // === v17.6 OPTION A: VISUAL CONTINUITY EXPIRY ========================
    // If we previously saved a dwell to savedDwellRef but gaze hasn't
    // returned within FIXATION_TTL_MS, clear the preserved visuals now.
    // Without this, the dwell circle could linger indefinitely at its
    // saved progress level after the user has clearly moved on.
    if (savedDwellRef.current && savedDwellExpiryRef.current > 0 && now > savedDwellExpiryRef.current) {
      // Telemetry: saved progress expired without resume (measurement only)
      try {
        const lostEl = savedDwellRef.current.element;
        recordDwellInterrupt({
          kind: 'expired',
          targetId: lostEl.id || (lostEl.textContent || '').trim().slice(0, 40),
          screen: ws.currentScreen || 'unknown',
          progress: savedDwellRef.current.progress,
          nearEdge: lostEl.isConnected ? isRectNearEdge(lostEl.getBoundingClientRect()) : false,
        });
      } catch { /* measurement only */ }
      savedDwellRef.current = null;
      savedDwellExpiryRef.current = 0;
      setDwellProgress(0);
      setTargetName('');
      setHighlightRect(null);
    }

    // Only dwell if:
    // - Element is clickable AND
    // - (Gaze is enabled OR element is always-active) AND
    // - (Not in navigation cooldown OR element is always-active)
    if (!clickable || (!enabled && !isAlwaysActive) || (inClickCooldown && !isToggle) || (inNavCooldown && !isAlwaysActive)) {
      setKeyboardOnsetVisual(null);
      // === INCOMPLETE FIXATION TTL ===
      // Save progress when gaze leaves so it can be resumed if user looks back
      let didCaptureSave = false;
      if (dwellTargetRef.current && isGazeTargetAvailable(dwellTargetRef.current) && dwellStartTimeRef.current > 0 && onsetCompletedRef.current) {
        const elapsed = now - dwellStartTimeRef.current;
        const targetContext = (getTargetAttr(dwellTargetRef.current, 'data-gaze-context') || '').trim();
        const contextKey = targetContext.toLowerCase();
        const effectiveDwell = _getEffectiveDwell(dwellTargetRef.current, contextKey, s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
        const currentProgress = Math.min(1, elapsed / effectiveDwell);
        if (currentProgress >= FIXATION_TTL_MIN_PROGRESS && currentProgress < 1) {
          const familiarTtl = keyboardFeelRef.current === 'familiar'
            && familiarKeyboardTarget(dwellTargetRef.current, isKeyboardScreenRef.current);
          const ttlMs = familiarTtl ? FAMILIAR_KEYBOARD_TIMING.incompleteTtl : FIXATION_TTL_MS;
          savedDwellRef.current = {
            element: dwellTargetRef.current,
            progress: currentProgress,
            timestamp: now,
          };
          savedDwellExpiryRef.current = now + ttlMs;
          progressBankRef.current.save(dwellTargetRef.current, currentProgress, now, ttlMs);
          didCaptureSave = true;
          // Telemetry: dwell progress suspended mid-fixation (measurement only)
          try {
            const r = dwellTargetRef.current.getBoundingClientRect();
            recordDwellInterrupt({
              kind: 'target_lost',
              targetId: dwellTargetRef.current.id || (dwellTargetRef.current.textContent || '').trim().slice(0, 40),
              screen: ws.currentScreen || 'unknown',
              progress: currentProgress,
              nearEdge: isRectNearEdge(r),
            });
          } catch { /* measurement only */ }
        }
      }

      dwellTargetRef.current = null;
      dwellStartTimeRef.current = 0;
      onsetTargetRef.current = null;
      onsetStartTimeRef.current = 0;
      onsetCompletedRef.current = false;
      setIsLocked(false);
      isLockedRef.current = false;

      // === v17.6 OPTION A: VISUAL CONTINUITY LAYER =======================
      // If we just captured a save (didCaptureSave) OR a save is already
      // active and hasn't expired yet, KEEP the dwell circle + highlight
      // at their current values. The patient sees a stable progress ring
      // through brief gaze excursions instead of the 25% → 0% → 25%
      // restart loop they reported on corner buttons / at greater
      // viewing distance. The visuals will either:
      //   • resume seamlessly when gaze returns to the same element
      //     (savedDwellRef resume path below), OR
      //   • be cleared by the expiry check at top of next frame, OR
      //   • be replaced when onset starts on a different element.
      const hasActiveSave = didCaptureSave
        || (savedDwellRef.current && now <= savedDwellExpiryRef.current);
      // ...and only while the gaze is still beside that target: a ring riding
      // along on the cursor elsewhere reads as one more jump (22 Sep 2026).
      // The saved progress itself stays for a quick return.
      const keepVisuals = hasActiveSave && !!savedDwellRef.current
        && isNearElement(savedDwellRef.current.element, estRef.current.x, estRef.current.y);
      if (!keepVisuals) {
        setDwellProgress(0);
        setTargetName('');
        setHighlightRect(null);
      }

      frameRef.current = requestAnimationFrame(dwellFrame);
      return;
    }

    // === ONSET DELAY PHASE (OptiKey-inspired two-phase fixation) ===
    // Phase 1: Cursor must remain on SAME element for ONSET_DELAY_MS.
    // The keyboard shows only an acquisition outline, never dwell progress,
    // until this phase completes.
    if (clickable !== onsetTargetRef.current) {
      setKeyboardOnsetVisual(null);
      // New target — start onset phase. A target that has only just taken
      // the focus is credited the samples that confirmed it
      // (ONSET_CREDIT_WINDOW_MS): the onset is as long as it always was.
      onsetTargetRef.current = clickable;
      const justFocused = clickable === focus.current && now - focus.acquiredAt <= ONSET_CREDIT_WINDOW_MS;
      onsetStartTimeRef.current = justFocused ? Math.min(now, focus.since) : now;
      onsetCompletedRef.current = false;

      // v18.1: what this target had reached before the eyes left it, banked
      // per target, so a glance at a neighbour no longer costs a nearly full
      // ring (utils/dwellProgressBank).
      const bankedProgress = takeBankedProgress(clickable, now);
      if (bankedProgress !== null) {
        // Resume from banked progress — skip onset since target was already validated
        onsetCompletedRef.current = true;
        const savedProgress = bankedProgress;
        // Telemetry: successful resume (recovery, not a loss — measurement only)
        try {
          recordDwellInterrupt({
            kind: 'resumed',
            targetId: clickable.id || (clickable.textContent || '').trim().slice(0, 40),
            screen: ws.currentScreen || 'unknown',
            progress: savedProgress,
            nearEdge: isRectNearEdge(clickable.getBoundingClientRect()),
          });
        } catch { /* measurement only */ }
        savedDwellRef.current = null;
        // v17.6 Option A: live dwell is taking over; clear the visual
        // continuity expiry so the next save-and-resume cycle starts
        // from a clean slate.
        savedDwellExpiryRef.current = 0;
        dwellProgressRef.current = savedProgress;

        dwellTargetRef.current = clickable;
        const effectiveDwell = _getEffectiveDwell(clickable,
          (getTargetAttr(clickable, 'data-gaze-context') || '').trim().toLowerCase(),
          s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
        // Set start time so that progress resumes from saved value
        dwellStartTimeRef.current = now - (savedProgress * effectiveDwell);
        const name = clickable.textContent?.slice(0, 15)?.trim() || clickable.tagName;
        setTargetName(name);
      } else {
        // Fresh onset — the previous target's VISUALS give way to this one.
        // v18.1: its progress stays in the bank (it is not this target's), so
        // looking back at it continues where it was.
        if (savedDwellRef.current) {
          savedDwellExpiryRef.current = 0;
        }
        savedDwellRef.current = null;
        dwellProgressRef.current = 0;
        setKeyboardOnsetVisual(clickable);
        // Reset dwell state during onset
        if (dwellTargetRef.current !== clickable) {
          dwellTargetRef.current = null;
          dwellStartTimeRef.current = 0;
          setDwellProgress(0);
          setTargetName('');
          setIsLocked(false);
          isLockedRef.current = false;
          setHighlightRect(null);
        }
      }
    }

    // Check if onset is still in progress
    if (!onsetCompletedRef.current) {
      // A brief gaze-loss event hides acquisition. Restore it on the first
      // usable frame if the same key is still being acquired.
      if (isKeyboardScreenRef.current && keyboardOnsetVisualRef.current !== clickable
          && clickable.matches('.keyboard-screen .keyboard-key')) {
        setKeyboardOnsetVisual(clickable);
      }
      // B1-FE extension (flag toggleCalmFrontend): with gaze ON, the toggle
      // uses the STANDARD onset — the 100ms fast path let a glance that
      // merely passed near the toggle become the dwell candidate almost
      // instantly (on-rig video 2026-07-06: "once it moves very near, it
      // takes the cursor to the toggle"). The fast onset remains for the
      // gaze-OFF bootstrap and for Emergency (always-active, not a toggle).
      const useFastOnset = isAlwaysActive &&
        !(gazeFlags.toggleCalmFrontend && isToggle && enabled);
      let onsetDuration = useFastOnset ? ONSET_DELAY_ALWAYS_ACTIVE_MS : ONSET_DELAY_MS;
      // B1 keyboardCadence (default OFF): use the stage's honest onset for
      // keyboard/prediction targets. Emergency/always-active keeps its fast
      // onset. The attr read only happens when the flag is on.
      const kbOnsetCadence = getKeyboardCadence();
      if (kbOnsetCadence && !useFastOnset) {
        const ctxHere = (getTargetAttr(clickable, 'data-gaze-context') || '').toLowerCase();
        if (ctxHere === 'keyboard' || ctxHere === 'keyboardkey' || ctxHere === 'prediction') {
          onsetDuration = kbOnsetCadence.onset;
        }
      }
      if (keyboardFeelRef.current === 'familiar'
          && familiarKeyboardTarget(clickable, isKeyboardScreenRef.current)) {
        onsetDuration = FAMILIAR_KEYBOARD_TIMING.onset;
      }
      const onsetElapsed = now - onsetStartTimeRef.current;
      if (onsetElapsed < onsetDuration) {
        // Still in onset phase — acquisition only, no dwell timer.
        frameRef.current = requestAnimationFrame(dwellFrame);
        return;
      }
      // Onset completed — transition to dwell phase
      setKeyboardOnsetVisual(null);
      onsetCompletedRef.current = true;
      if (dwellTargetRef.current !== clickable) {
        dwellTargetRef.current = clickable;
        dwellStartTimeRef.current = now;
        // v18.1: the eyes were here a moment ago and the raw gaze is back:
        // continue that ring instead of starting again from nothing. (The
        // first chance is at acquisition, before this onset; the raw is often
        // a sample or two behind the estimate, hence this second one.)
        const banked = takeBankedProgress(clickable, now);
        if (banked !== null) {
          const effDwell = _getEffectiveDwell(clickable,
            (getTargetAttr(clickable, 'data-gaze-context') || '').trim().toLowerCase(),
            s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
          dwellStartTimeRef.current = now - banked * effDwell;
          dwellProgressRef.current = banked;
          try {
            recordDwellInterrupt({
              kind: 'resumed',
              targetId: clickable.id || (clickable.textContent || '').trim().slice(0, 40),
              screen: ws.currentScreen || 'unknown',
              progress: banked,
              nearEdge: isRectNearEdge(clickable.getBoundingClientRect()),
            });
          } catch { /* measurement only */ }
        }
        setIsLocked(false);
        isLockedRef.current = false;
        const name = clickable.textContent?.slice(0, 15)?.trim() || clickable.tagName;
        setTargetName(name);
        // The bubble is already at this target's centre (drawBubble); the
        // highlight marks the start of the selection.
        const rect = clickable.getBoundingClientRect();
        setHighlightRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height,
          keyboardKey: isKeyboardScreenRef.current && clickable.matches('.keyboard-screen .keyboard-key') });
      }
    }

    // Ensure dwell target is set (for resumed dwells)
    if (dwellTargetRef.current !== clickable) {
      dwellTargetRef.current = clickable;
      dwellStartTimeRef.current = now;
      setIsLocked(false);
      isLockedRef.current = false;
      const name = clickable.textContent?.slice(0, 15)?.trim() || clickable.tagName;
      setTargetName(name);
      const rect = clickable.getBoundingClientRect();
      setHighlightRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        keyboardKey: isKeyboardScreenRef.current && clickable.matches('.keyboard-screen .keyboard-key') });
    }

    // Progress — only counts AFTER onset completes
    const elapsed = now - dwellStartTimeRef.current;
    const targetContext = (getTargetAttr(clickable, 'data-gaze-context') || '').trim();
    const contextKey = targetContext.toLowerCase();
    const effectiveDwell = _getEffectiveDwell(clickable, contextKey, s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
    const progress = Math.min(1, elapsed / effectiveDwell);
    dwellProgressRef.current = progress;
    setDwellProgress(progress);

    // Progressive lock
    if ((progress >= LOCK_THRESHOLD || elapsed >= LOCK_AFTER_MS) && !isLockedRef.current) {
      isLockedRef.current = true;
      // Leaving is judged from the target's centre, where the bubble rests.
      lockPosRef.current = rectCentre(clickable.getBoundingClientRect());
      lockAwaySinceRef.current = 0;
      setIsLocked(true);
    }

    // Fire click at 100%
    if (progress >= 1 && dwellTargetRef.current && isGazeTargetAvailable(dwellTargetRef.current)) {
      lastClickTimeRef.current = now;
      // v10: Record toggle lockout state before firing
      if (isGazeToggleElement(dwellTargetRef.current)) {
        lastToggleTimeRef.current = now;
        toggleLookedAwayRef.current = false;
      }

      // B1 keyboardCadence: remember whether this click was a keyboard-context
      // target so the NEXT click's cooldown can use the keyboard cooldown base.
      lastClickWasKeyboardRef.current = contextKey === 'keyboard' || contextKey === 'keyboardkey' || contextKey === 'prediction';

      // === R1: TELEMETRY ===========================================
      // Record this click's residual (raw gaze vs target center),
      // acquisition time and context. No behaviour change — pure
      // measurement. Inspect with `window.__gazeTelemetry.snapshot()`.
      try {
        const target = dwellTargetRef.current;
        const rect = target.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        const gaze = lastRawPointRef.current;
        const contextAttr = (getTargetAttr(target, 'data-gaze-context') || '').trim();
        const actionAttr = (getTargetAttr(target, 'data-action') || '').trim();
        const targetLabel = target.id
          || (target.textContent || '').trim().slice(0, 40)
          || target.tagName.toLowerCase();
        // Runner-up key: nearest OTHER keyboard-key center to the gaze sample.
        // A small distance => the intended key was ambiguous (confusion fuel).
        let nearestAlt: { id: string; dist: number } | null = null;
        if (contextAttr === 'keyboard' && keyboardKeysRef.current.length > 1) {
          let best = Infinity;
          for (const k of keyboardKeysRef.current) {
            if (k.element === target) continue;
            const ddx = gaze.x - k.centerX;
            const ddy = gaze.y - k.centerY;
            const d = Math.sqrt(ddx * ddx + ddy * ddy);
            if (d < best) {
              best = d;
              nearestAlt = {
                id: k.element.id || (k.element.textContent || '').trim().slice(0, 8) || '?',
                dist: Math.round(d),
              };
            }
          }
        }
        recordDwellEvent({
          targetId: targetLabel,
          context: contextAttr,
          screen: ws.currentScreen || 'unknown',
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          center,
          gaze: { x: gaze.x, y: gaze.y },
          onsetToClickMs: onsetStartTimeRef.current > 0 ? now - onsetStartTimeRef.current : 0,
          dwellToClickMs: dwellStartTimeRef.current > 0 ? now - dwellStartTimeRef.current : 0,
          action: actionAttr || undefined,
          nearestAlt,
        });
      } catch { /* never let telemetry block the click */ }

      // Selected: nothing carries over to the next dwell, here or on any
      // other target the eyes passed (OptiKey clears its banked keys too).
      progressBankRef.current.clear();
      dwellProgressRef.current = 0;
      lastGazeActivationRef.current = { element: dwellTargetRef.current, at: now };
      confirmKeyboardSelection(dwellTargetRef.current);
      dwellTargetRef.current.click();
      setKeyboardOnsetVisual(null);
      dwellTargetRef.current = null;
      dwellStartTimeRef.current = 0;
      onsetTargetRef.current = null;
      onsetStartTimeRef.current = 0;
      onsetCompletedRef.current = false;
      savedDwellRef.current = null;
      setDwellProgress(0);
      setTargetName('');
      setIsLocked(false);
      isLockedRef.current = false;
      setHighlightRect(null);
    }

    frameRef.current = requestAnimationFrame(dwellFrame);
  }, [enabled, isMouseMode, isGazeToggleElement, isAlwaysActiveElement, getTargetAttr, _getEffectiveDwell, getKeyboardCadence, resetSelection, drawBubble, takeBankedProgress, setKeyboardOnsetVisual, clearKeyboardConfirmation, confirmKeyboardSelection]);

  // Core gaze handler with coordinate transformation
  const handleGaze = useCallback((data: any) => {
    const now = Date.now();
    if (!freshnessRef.current.receive(data, now, performance.now())) return;
    reportGazeReceived();
    if (lastGazeFrameAtRef.current && now - lastGazeFrameAtRef.current > GAZE_RECOVERY_MS) resetSelection();

    // Rate tracking
    msgCountRef.current++;
    if (now - lastSecRef.current >= 1000) {
      setMsgsPerSec(msgCountRef.current);
      msgCountRef.current = 0;
      lastSecRef.current = now;
    }

    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;

    // === FREEZE INSTRUMENTATION + PAUSE-ON-GAP INPUTS ===
    // Record gaze-stream gaps >200ms (measurement only) and track the
    // latest frame time + signal state for the flagged dwell pause logic.
    if (lastGazeFrameAtRef.current > 0) {
      const gapMs = now - lastGazeFrameAtRef.current;
      if (gapMs > FREEZE_RECORD_MS) {
        try { recordFreeze('gaze_gap', gapMs); } catch { /* measurement only */ }
      }
    }
    lastGazeFrameAtRef.current = now;
    lastSignalStateRef.current = typeof data.signal_state === 'string' ? data.signal_state : 'valid';

    // === LATENCY RECORDING (measurement only) ===
    // t_helper_ms / t_sent_wall_ms are same-machine Unix-ms stamps from the
    // C# helper and the Python broadcast path; `now` is the WS receive time.
    // Gap-hold rebroadcasts re-send the same payload — identical helper
    // stamp — and are skipped so held frames don't pollute the percentiles.
    const tHelperMs = typeof data.t_helper_ms === 'number' ? data.t_helper_ms : 0;
    const tSentMs = typeof data.t_sent_wall_ms === 'number' ? data.t_sent_wall_ms : 0;
    if (tHelperMs > 0 && tSentMs > 0 && tHelperMs !== lastTHelperMsRef.current) {
      lastTHelperMsRef.current = tHelperMs;
      const ingestMs = typeof data.sample_age_ms === 'number' ? data.sample_age_ms : -1;
      try {
        lastLatencySampleRef.current = recordGazeLatency({
          ingestMs,
          pipelineMs: Math.max(0, tSentMs - tHelperMs - Math.max(0, ingestMs)),
          wsMs: Math.max(0, now - tSentMs),
          e2eMs: Math.max(0, now - tHelperMs),
          paintMs: -1,
        });
      } catch { /* measurement only */ }
    } else {
      lastLatencySampleRef.current = null;
    }

    // Track gaze state from backend classifier
    gazeStateRef.current = data.gaze_state;
    const backendZone = typeof data?.backend_zone === 'string' ? data.backend_zone : '';
    const backendLocked = data?.is_fixation === true || backendZone === 'fixation-hold' || backendZone === 'edge-hold';
    const backendOnKey = data?.backend_on_key === true;
    const backendMagnetPx = typeof data?.backend_magnet_px === 'number' ? data.backend_magnet_px : 0;

    // === COORDINATE TRANSFORMATION ===
    // Backend now labels coordinate space explicitly.
    // Preferred contract: coord_space='window' => x/y already normalized to app content.
    // Legacy fallback: coord_space='screen' => convert full-screen normalized to window coords.
    let rawX: number, rawY: number;
    const coordSpace = data?.coord_space === 'screen' ? 'screen' : 'window';
    if (coordSpace === 'window') {
      rawX = data.x * window.innerWidth;
      rawY = data.y * window.innerHeight;
    } else {
      const bounds = windowBoundsRef.current;
      if (bounds && (bounds.isFullScreen || bounds.isMaximized)) {
        rawX = data.x * window.innerWidth;
        rawY = data.y * window.innerHeight;
      } else if (bounds) {
        const screenPixelX = data.x * bounds.screenWidth;
        const screenPixelY = data.y * bounds.screenHeight;
        rawX = (screenPixelX - bounds.x) * (window.innerWidth / bounds.width);
        rawY = (screenPixelY - bounds.y) * (window.innerHeight / bounds.height);
      } else {
        rawX = data.x * window.innerWidth;
        rawY = data.y * window.innerHeight;
      }
    }

    // === MANUAL GAZE OFFSET ===
    // v15 FIX: Offset is already applied in backend (_screen_to_window_normalized).
    // Applying here too caused DOUBLE offset — user sets -35px, gets -70px effective.
    // Removed frontend application to fix double-offset bug.

    // Clamp with generous overshoot so EMA smoothing can push cursor to true edges
    const EDGE_OVERSHOOT = 48;
    rawX = Math.max(-EDGE_OVERSHOOT, Math.min(window.innerWidth + EDGE_OVERSHOOT, rawX));
    rawY = Math.max(-EDGE_OVERSHOOT, Math.min(window.innerHeight + EDGE_OVERSHOOT, rawY));

    // === v16: OptiKey-style 3-sample pre-smoothing (ALL SCREENS) ===
    // Legacy GazeConnect weighted average; bypassed with the adaptive backend.
    // Reduces directional EMA lag bias by pre-centering the input signal.
    // v16: Extended to ALL screens — cursor stability benefits every screen, not just keyboard.
    const backendOwnsStability = data.active_pipeline === 'adaptive_cursor_v1' || backendLocked || backendOnKey || backendMagnetPx > BACKEND_MAGNET_ACTIVE_PX;
    if (!backendOwnsStability) {
      if (!preSmoothInitRef.current) {
        preSmoothPrev1Ref.current = { x: rawX, y: rawY };
        preSmoothPrev2Ref.current = { x: rawX, y: rawY };
        preSmoothInitRef.current = true;
      }
      const pre1 = preSmoothPrev1Ref.current;
      const pre2 = preSmoothPrev2Ref.current;
      const smoothedX = rawX * 0.45 + pre1.x * 0.30 + pre2.x * 0.25;
      const smoothedY = rawY * 0.45 + pre1.y * 0.30 + pre2.y * 0.25;
      preSmoothPrev2Ref.current = { x: pre1.x, y: pre1.y };
      preSmoothPrev1Ref.current = { x: rawX, y: rawY };
      rawX = smoothedX;
      rawY = smoothedY;
    } else {
      preSmoothPrev1Ref.current = { x: rawX, y: rawY };
      preSmoothPrev2Ref.current = { x: rawX, y: rawY };
      preSmoothInitRef.current = true;
    }

    const prevRaw = lastRawPointRef.current;
    const rawJumpPx = Math.hypot(rawX - prevRaw.x, rawY - prevRaw.y);
    const backendReleased = prevBackendOnKeyRef.current && !backendOnKey;
    if (gazeStateRef.current === 'saccade' || rawJumpPx >= RAW_SACCADE_BYPASS_PX) {
      suppressPullUntilRef.current = Math.max(suppressPullUntilRef.current, now + SNAP_BYPASS_MS);
    }
    if (backendReleased) {
      suppressPullUntilRef.current = Math.max(suppressPullUntilRef.current, now + ON_KEY_RELEASE_BYPASS_MS);
    }
    const inIntentBypass = now < suppressPullUntilRef.current;
    prevBackendOnKeyRef.current = backendOnKey;
    lastRawPointRef.current = { x: rawX, y: rawY, t: now };

    // v16: NEVER suppress frontend snapping — center-pull is essential on ALL screens.
    // Backend on_key uses pre-filter Kalman coords that are less accurate than post-filter.
    // Suppressing snapping removed the one mechanism that pulled cursor toward button centers.
    // The dual-pull concern is mitigated by reduced snap strength (0.22) and backend magnetism (0.32).
    const suppressFrontendPull = backendOwnsStability || inIntentBypass;

    // === SEMANTIC SNAPPING ===
    // Apply only when backend is not hard-locked.
    const snap = (backendLocked || suppressFrontendPull)
      ? { x: rawX, y: rawY, snapStrength: 0 }
      : computeSnap(rawX, rawY, gazeStateRef.current, snapTargetsRef.current);
    const wasSnapped = snap.snapStrength > 0.05;
    rawX = snap.x;
    rawY = snap.y;

    // === LOCK CHECK (v17.10: gated by actual target rect) =================
    // Behavioural-analysis discovery: the dwell ring was filling to ~90 %
    // on the "L" key and on prediction-strip targets, then aborting
    // without firing the click. The single code path that aborts at
    // high dwell progress is THIS one. The previous logic:
    //
    //   if (distFromLock > 80) → abort dwell
    //
    // ...uses RAW gaze distance from lock position. lockPos == target
    // centre (because R2 anchor put posRef there at lock time). For ALS
    // users with Tobii ET5 noise of 50–80 px at edges, routine fixation
    // generates raw-gaze excursions ≥80 px from target centre. The
    // lock breaks on noise even though the user is still genuinely
    // fixating on the button.
    //
    // The fix: lock-break now requires BOTH conditions:
    //   (a) raw gaze > LOCK_BREAK_DISTANCE from lockPos, AND
    //   (b) raw gaze actually outside the dwell target's rect (with
    //       generous tolerance to absorb noise that still indicates
    //       the user is on the button)
    //
    // This means lock holds when the user is genuinely looking at the
    // button (even with noisy raw samples) and breaks only when the
    // user has clearly moved their gaze elsewhere. The 90 % abort
    // bug — which the video analysis isolated to a single frame
    // around timestamp v1 0:23.6 — disappears.
    if (isLockedRef.current) {
      const intentX = Number.isFinite(data.intent_x) ? data.intent_x * window.innerWidth : rawX;
      const intentY = Number.isFinite(data.intent_y) ? data.intent_y * window.innerHeight : rawY;
      const distFromLock = Math.hypot(intentX - lockPosRef.current.x, intentY - lockPosRef.current.y);
      let shouldBreakLock = distFromLock > LOCK_BREAK_DISTANCE;

      if (shouldBreakLock && dwellTargetRef.current && dwellTargetRef.current.isConnected) {
        const tRect = dwellTargetRef.current.getBoundingClientRect();
        if (tRect.width > 0 && tRect.height > 0) {
          // Generous tolerance — should catch all gaze noise that
          // still corresponds to the user fixating on this button.
          // Set to roughly half the LOCK_BREAK_DISTANCE so the OR-zone
          // (rect + this) is meaningfully larger than the lockPos circle.
          const LOCK_RECT_TOLERANCE = 45;
          const insideTargetRect = (
            intentX >= tRect.left - LOCK_RECT_TOLERANCE
            && intentX <= tRect.right + LOCK_RECT_TOLERANCE
            && intentY >= tRect.top - LOCK_RECT_TOLERANCE
            && intentY <= tRect.bottom + LOCK_RECT_TOLERANCE
          );
          if (insideTargetRect) {
            shouldBreakLock = false;
          }
        }
      }

      // A single wild sample must not break the lock (LOCK_BREAK_CONFIRM_MS).
      // While a look-away is pending, dwellFrame holds the progress still.
      const sampleMs = Number.isFinite(data.t_helper_ms) && data.t_helper_ms > 0 ? data.t_helper_ms : now;
      if (!shouldBreakLock || !gazeFlags.lockBreakConfirm) {
        lockAwaySinceRef.current = 0;
      } else if (lockAwaySinceRef.current === 0) {
        lockAwaySinceRef.current = sampleMs;
        shouldBreakLock = false;
      } else if (sampleMs - lockAwaySinceRef.current < LOCK_BREAK_CONFIRM_MS) {
        shouldBreakLock = false;
      }

      if (shouldBreakLock) {
        lockAwaySinceRef.current = 0;
        // === LOCK-BREAK PROGRESS RETENTION (flag, default ON) =============
        // Mirror the hit-test-miss save path: preserve dwell progress in
        // the fixation-TTL store so re-fixating the same target within
        // FIXATION_TTL_MS resumes instead of restarting from 0. Baseline
        // behavior (flag off) discards all progress here.
        let lockBreakSaved = false;
        const brokenTarget = dwellTargetRef.current;
        let brokenProgress = 0;
        if (brokenTarget && dwellStartTimeRef.current > 0) {
          const tCtx = (getTargetAttr(brokenTarget, 'data-gaze-context') || '').trim().toLowerCase();
          const tIsToggle = brokenTarget.getAttribute('data-gaze-toggle') === 'true';
          const effDwell = _getEffectiveDwell(brokenTarget, tCtx, dwellSettingsRef.current, tIsToggle,
            isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
          brokenProgress = Math.min(1, (now - dwellStartTimeRef.current) / effDwell);
          if (gazeFlags.lockBreakProgressRetention
            && brokenProgress >= FIXATION_TTL_MIN_PROGRESS && brokenProgress < 1) {
            const familiarTtl = keyboardFeelRef.current === 'familiar'
              && familiarKeyboardTarget(brokenTarget, isKeyboardScreenRef.current);
            const ttlMs = familiarTtl ? FAMILIAR_KEYBOARD_TIMING.incompleteTtl : FIXATION_TTL_MS;
            savedDwellRef.current = { element: brokenTarget, progress: brokenProgress, timestamp: now };
            savedDwellExpiryRef.current = now + ttlMs;
            progressBankRef.current.save(brokenTarget, brokenProgress, now, ttlMs);
            lockBreakSaved = true;
          }
          // Telemetry: lock-break interruption (measurement only, always on)
          try {
            recordDwellInterrupt({
              kind: 'lock_break',
              targetId: brokenTarget.id || (brokenTarget.textContent || '').trim().slice(0, 40),
              screen: ws.currentScreen || 'unknown',
              progress: brokenProgress,
              nearEdge: brokenTarget.isConnected ? isRectNearEdge(brokenTarget.getBoundingClientRect()) : false,
            });
          } catch { /* measurement only */ }
        }

        isLockedRef.current = false;
        setIsLocked(false);
        dwellTargetRef.current = null;
        dwellStartTimeRef.current = 0;
        if (lockBreakSaved) {
          // Reset onset identity so re-acquiring this target goes through
          // the "new target" branch, where the saved-progress resume path
          // lives. Without this, the sticky-target path can fresh-start
          // the dwell and silently discard the save.
          onsetTargetRef.current = null;
          onsetStartTimeRef.current = 0;
          onsetCompletedRef.current = false;
        }
        // With a save active, the ring and highlight stay for visual
        // continuity (v17.6 Option A) only while the gaze is still beside
        // that target. Gone elsewhere, a half-filled ring riding along on
        // the cursor to the next card was one more jump for the eyes; the
        // saved progress is kept (invisibly) for a quick return either way.
        if (!lockBreakSaved || !brokenTarget || !isNearElement(brokenTarget, rawX, rawY)) {
          setDwellProgress(0);
          setTargetName('');
          setHighlightRect(null);
        }
        // The eyes really left. The focus now follows the estimate without
        // hysteresis; the bubble stays on this target until the next one is
        // decided, then glides straight there (no hop to the gaze and back).
        focusRef.current.leave();
        dwellProgressRef.current = 0;
      }
    }

    // === STATE-AWARE VELOCITY-ADAPTIVE SMOOTHING (the gaze ESTIMATE) ===
    // Legacy pipelines only: with the adaptive backend alpha is 1 below and the
    // estimate is the backend's own. The estimate is not what is drawn.
    const dx = rawX - estRef.current.x;
    const dy = rawY - estRef.current.y;
    const distance = Math.hypot(dx, dy);

    let alpha: number;
    const state = gazeStateRef.current;

    if (backendLocked) {
      // === BACKEND LOCKED ===
      alpha = distance < 1 ? 0.0 : 1.0;
    } else if (state === 'saccade') {
      // Saccade: track eye movement quickly to reach new target
      alpha = 0.90;
    } else if (state === 'glissade') {
      // Post-saccade settling: moderate convergence
      alpha = 0.65;
    } else if (state === 'fixation') {
      // v17: Heavier cursor during fixation for both keyboard and other
      // screens. Previously 0.45 for non-keyboard let raw gaze noise of
      // 15–25 px (typical Tobii ET5 baseline for ALS users with mild
      // ocular tremor) drift the cursor toward the card corners. 0.36
      // lets the snap layer (semantic + backend magnet) catch and hold
      // center without phase lag becoming noticeable at 1.2 s dwell.
      const fixAlpha = isKeyboardScreenRef.current ? 0.38 : 0.36;
      alpha = distance < NOISE_THRESHOLD ? 0.16 : fixAlpha;
    } else {
      // No state info from backend: use velocity-adaptive fallback
      if (distance < NOISE_THRESHOLD) {
        alpha = ALPHA_NOISE;
      } else if (distance < SLOW_THRESHOLD) {
        alpha = ALPHA_SLOW;
      } else if (distance > FAST_THRESHOLD) {
        alpha = ALPHA_FAST;
      } else {
        const t = (distance - SLOW_THRESHOLD) / (FAST_THRESHOLD - SLOW_THRESHOLD);
        alpha = ALPHA_NORMAL + t * (ALPHA_FAST - ALPHA_NORMAL);
      }
    }

    // Anti-jitter: when dwelling on a target and cursor barely moved, freeze.
    // Skip when backend-locked (already handled above with STABLE_ZONE check).
    if (!backendLocked && dwellTargetRef.current && distance < STABLE_ZONE) {
      alpha = 0.0;
    }

    // Edge-aware alpha boost: prevent cursor from getting "stuck" near screen edges.
    // Only needed when backend is NOT locked (locked state already uses 0.90).
    if (!backendLocked) {
      const EDGE_BOOST_ZONE = 100;
      const EDGE_BOOST_ALPHA = 0.55;
      const nearEdge = (
        (estRef.current.x < EDGE_BOOST_ZONE && dx < 0) ||
        (estRef.current.x > window.innerWidth - EDGE_BOOST_ZONE && dx > 0) ||
        (estRef.current.y < EDGE_BOOST_ZONE && dy < 0) ||
        (estRef.current.y > window.innerHeight - EDGE_BOOST_ZONE && dy > 0)
      );
      if (nearEdge) {
        alpha = Math.max(alpha, EDGE_BOOST_ALPHA);
      }
    }

    // The adaptive backend owns smoothing; avoid adding frame-rate dependent lag.
    if (data.active_pipeline === 'adaptive_cursor_v1') alpha = 1;

    // Apply EMA
    estRef.current.x += alpha * dx;
    estRef.current.y += alpha * dy;

    // Minimal frontend assist only for gaze-toggle targets.
    // Main magnetism/stability now lives in backend to avoid dual-pull drift.
    if (!backendLocked && !wasSnapped && !suppressFrontendPull) {
      const toggleTargets = snapTargetsRef.current.filter(t => t.priority >= 3);
      let bestToggle: SnapTarget | null = null;
      let bestDist = Infinity;
      for (const t of toggleTargets) {
        const cx = t.rect.left + t.rect.width / 2;
        const cy = t.rect.top + t.rect.height / 2;
        const d = Math.hypot(estRef.current.x - cx, estRef.current.y - cy);
        if (d < bestDist) {
          bestDist = d;
          bestToggle = t;
        }
      }
      // B1-FE (flag toggleCalmFrontend): trim the gaze-ON assist — with
      // gaze enabled the toggle doesn't need a wide capture halo, and the
      // patient reported being pulled in when looking NEAR (not at) it.
      // The gaze-OFF branch (0.18/140) is deliberately untouched: it is
      // the bootstrap path for re-enabling gaze and must stay reliable.
      const assistRadius = enabled ? (gazeFlags.toggleCalmFrontend ? 90 : 112) : 140;
      const assistStrength = enabled ? (gazeFlags.toggleCalmFrontend ? 0.08 : 0.12) : 0.18;
      if (bestToggle && bestDist < assistRadius) {
        const cx = bestToggle.rect.left + bestToggle.rect.width / 2;
        const cy = bestToggle.rect.top + bestToggle.rect.height / 2;
        const strength = assistStrength * Math.pow(1 - bestDist / assistRadius, 1.35);
        estRef.current.x += (cx - estRef.current.x) * strength;
        estRef.current.y += (cy - estRef.current.y) * strength;
      }
    }

    // Clamp final position — allow slight overshoot for edge button visibility
    estRef.current.x = Math.max(-30, Math.min(window.innerWidth + 30, estRef.current.x));
    estRef.current.y = Math.max(-30, Math.min(window.innerHeight + 30, estRef.current.y));

    // === v18: WHICH TARGET ARE THE EYES ON (utils/gazeFocus) ===============
    // Decided here, per sample, on the estimate; drawBubble then shows the
    // bubble at that target's centre. With gaze selection off only the
    // always-active controls can be chosen, so the bubble does not settle on
    // anything else. A locked dwell owns the focus until its lock breaks.
    const est = estRef.current;
    let candidate = pickCandidate(est.x, est.y);
    if (candidate.element && !enabled && !candidate.isAlwaysActive) candidate = NO_CANDIDATE;
    const focus = focusRef.current;
    const dwellLocked = isLockedRef.current && dwellTargetRef.current !== null
      && dwellTargetRef.current === focus.current;
    focus.update(candidate.element, est, now, {
      rectOf: (el) => (isGazeTargetAvailable(el) ? el.getBoundingClientRect() : null),
      hold: dwellLocked,
      // A ring already filling holds its target harder (gazeFocus COMMIT_*).
      commitment: dwellTargetRef.current === focus.current ? dwellProgressRef.current : 0,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    // Where the bubble rests while no target has the focus: it follows only a
    // lasting move, and starts from where the eyes are when a focus ends.
    if (focus.current) freeAnchorRef.current.reset(est);
    else freeAnchorRef.current.update(est, now);

    // A5 — sampled paint delta: every 8th recorded frame, one rAF after the
    // transform write measures WS-receive -> next-composited-frame time.
    const latencySample = lastLatencySampleRef.current;
    if (latencySample) {
      latencyPaintCounterRef.current = (latencyPaintCounterRef.current + 1) % 8;
      if (latencyPaintCounterRef.current === 0) {
        const recvTs = now;
        requestAnimationFrame(() => {
          latencySample.paintMs = Math.max(0, Date.now() - recvTs);
        });
      }
    }
  }, [enabled, reportGazeReceived, isGazeToggleElement, resetSelection, pickCandidate]);

  // v17: Handle gaze_lost events — pause dwell during blink/stale/gap
  // When backend detects blink or tracking loss, we freeze dwell progress
  // instead of resetting it. This prevents blinks from losing typing progress.
  useEffect(() => {
    const handleGazeLost = () => {
      freshnessRef.current.lose();
      setKeyboardOnsetVisual(null);
      clearKeyboardConfirmation();
    };
    window.addEventListener('gaze_lost', handleGazeLost);
    return () => window.removeEventListener('gaze_lost', handleGazeLost);
  }, [setKeyboardOnsetVisual, clearKeyboardConfirmation]);

  // Mouse, touch and pen stay available beside gaze (see DUPLICATE_INPUT_MS).
  // Gaze presses are programmatic, so isTrusted tells the two apart. Capture
  // phase on window: this runs before React's delegated handlers.
  useEffect(() => {
    const handlePointerDown = (event: Event) => {
      if (!event.isTrusted) return;
      resetSelection();
      lastClickTimeRef.current = Date.now();
    };
    const handleClick = (event: Event) => {
      const recent = lastGazeActivationRef.current;
      if (!event.isTrusted || !recent || Date.now() - recent.at > DUPLICATE_INPUT_MS) return;
      const target = event.target as Node | null;
      if (target && (recent.element === target || recent.element.contains(target))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('click', handleClick, true);
    };
  }, [resetSelection]);

  // Startup
  useEffect(() => {
    console.log('[GazeCursor] Single selection owner with freshness gating');
    const unsub = ws.subscribeGaze(handleGaze);
    frameRef.current = requestAnimationFrame(dwellFrame);
    return () => {
      cancelAnimationFrame(frameRef.current);
      unsub();
    };
  }, [ws.subscribeGaze, handleGaze, dwellFrame]);

  // Mouse-Only Mode: hide cursor and dwell UI entirely
  if (isMouseMode) {
    return null;
  }

  // Aesthetic Colors (User Requested: "Decent Blue" & "Compatible Aesthetics")
  const CURSOR_COLOR_NORMAL = '#38BDF8'; // Sky Blue (Decent Blue)
  const CURSOR_COLOR_LOCKED = '#2DD4BF'; // Warm Teal (Matches Buttons)

  // v10: Brighter idle cursor — #666666 was nearly invisible on #0D1117 dark background,
  // especially with longer dwell times (800-1000ms vs old 500ms before ring appears)
  const CURSOR_COLOR_IDLE = '#8899AA'; // Muted steel blue — visible on dark bg without being distracting
  const cursorColor = isLocked ? CURSOR_COLOR_LOCKED : (enabled || dwellProgress > 0 ? CURSOR_COLOR_NORMAL : CURSOR_COLOR_IDLE);
  // The bubble's ring. Dark: amber (24 Sep 2026), because a light ring was lost among the Dark
  // keyboard's near-white letters; amber stands apart from them and from the teal dwell fill.
  // Warm keeps the light ring, whose soft dark edge reads on its pale keys.
  const BUBBLE_RING_COLOR = isWarm || isLight ? 'rgba(255, 255, 255, 0.82)' : '#FFC247';
  const ringPx = Math.max(5, Math.round(CURSOR_SIZE * BUBBLE_RING_SHARE));
  const arcR = (CURSOR_SIZE - ringPx) / 2;
  const arcLen = 2 * Math.PI * arcR;
  const bubbleVisible = !gazeAbsent && (showRoamingCursor || dwellProgress > 0);

  return (
    <>
      {/* v16: Visual Selection Highlight — rectangular border around the element being dwelled on.
          Provides psychological stability: the highlight stays fixed on the correct element
          even if the cursor has micro-drift, matching Grid 3 / Tobii Communicator behavior. */}
      {highlightRect && (dwellProgress > 0 || highlightRect.keyboardKey) && (
        <div
          data-cursor="true"
          style={{
            position: 'fixed',
            left: highlightRect.left - 3,
            top: highlightRect.top - 3,
            width: highlightRect.width + 6,
            height: highlightRect.height + 6,
            borderRadius: 8,
            border: `3px solid ${highlightRect.keyboardKey ? CURSOR_COLOR_LOCKED : isLocked ? CURSOR_COLOR_LOCKED : CURSOR_COLOR_NORMAL}`,
            backgroundColor: 'transparent',
            pointerEvents: 'none',
            zIndex: 2147483646, // Just below cursor
            boxShadow: highlightRect.keyboardKey ? 'none'
              : `0 0 ${8 + dwellProgress * 12}px ${isLocked ? CURSOR_COLOR_LOCKED : CURSOR_COLOR_NORMAL}40`,
            opacity: highlightRect.keyboardKey ? 1 : Math.min(1, dwellProgress * 3),
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}
        />
      )}

      {/* The gaze bubble (v18). Position: direct DOM transform writes from the
          display loop (drawBubble); the transform below only covers the
          initial mount and re-derives the SAME value from posRef on React
          re-renders, so the two writers stay consistent. A ring with a clear
          centre and a soft dark edge (Tobii Experience's "Preview my gaze"):
          light in Warm, amber in Dark (BUBBLE_RING_COLOR); the dwell fills the
          ring in teal. No centre dot: nothing small to jitter. */}
      <div
        ref={cursorElRef}
        data-cursor="true"
        className={`gaze-bubble${dwellProgress > 0 ? ' dwelling' : ''}${isLocked ? ' locked' : ''}${enabled ? '' : ' gaze-off'}`}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          transform: `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0) translate(-50%, -50%)`,
          willChange: 'transform, opacity',
          width: CURSOR_SIZE,
          height: CURSOR_SIZE,
          borderRadius: '50%',
          pointerEvents: 'none',
          opacity: bubbleVisible ? (enabled || dwellProgress > 0 ? 1 : 0.55) : 0,
          zIndex: 2147483647, // MAX Z-INDEX (Cursor must be on top of everything)
          transition: 'opacity 140ms ease',
        }}
      >
        <div
          className="gaze-bubble-ring"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxSizing: 'border-box',
            border: `${ringPx}px solid ${BUBBLE_RING_COLOR}`,
            background: 'transparent',
            boxShadow: '0 0 0 1.5px rgba(0, 0, 0, 0.32), 0 2px 12px rgba(0, 0, 0, 0.45), '
              + 'inset 0 0 0 1.5px rgba(0, 0, 0, 0.30), inset 0 0 8px rgba(0, 0, 0, 0.22)',
          }}
        />
        {dwellProgress > 0 && (
          <svg
            className="gaze-bubble-progress"
            width={CURSOR_SIZE}
            height={CURSOR_SIZE}
            style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', overflow: 'visible' }}
          >
            <circle
              cx={CURSOR_SIZE / 2}
              cy={CURSOR_SIZE / 2}
              r={arcR}
              fill="none"
              stroke={CURSOR_COLOR_LOCKED}
              strokeWidth={ringPx}
              strokeLinecap="round"
              strokeDasharray={arcLen}
              strokeDashoffset={arcLen * (1 - dwellProgress)}
            />
          </svg>
        )}
      </div>

      {/* Compact status indicator */}
      <div className="gaze-status-indicator" style={{
        position: 'fixed', top: 4, right: 4,
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: '#fff', padding: '4px 8px', borderRadius: 6,
        fontFamily: 'monospace', fontSize: 10,
        zIndex: 999999, pointerEvents: 'none',
        border: `1px solid ${cursorColor}40`,
        lineHeight: 1.4,
      }}>
        <span style={{ color: enabled ? '#0F0' : '#888' }}>
          {enabled ? '● ON' : '○ OFF'}
        </span>
        {' '}
        <span style={{ color: msgsPerSec > 25 ? '#0F0' : '#F80' }}>{msgsPerSec}/s</span>
        {' '}
        <span style={{ color: hasRealGaze ? '#0FF' : '#888', fontSize: 9 }}>
          {hasRealGaze ? 'Gaze' : 'Mouse'}
        </span>
      </div>
      <TrackerStatusNotice status={ws.trackerStatus} />
    </>
  );
};
