// =============================================
// GazeCursor.tsx - v10.0 ACCURACY FIX + ONSET DELAY + FIXATION TTL
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
import { collectKeyboardKeys, findBestKeyboardKey, type KeyRect } from '../../utils/hitZoneExpansion';
import { recordDwellEvent } from '../../utils/gazeTelemetry';

// === TUNING PARAMETERS ===
const CURSOR_SIZES: Record<string, number> = { small: 50, medium: 70, large: 90 };
const DEFAULT_CURSOR_SIZE = 70;
const DWELL_TIME = 1000;         // v10: 1.0s base dwell (was 0.7s) — less overwhelming for Papa
const CLICK_COOLDOWN = 1300;     // v10: 1.3s cooldown (was 0.9s) — prevents rapid re-fire
const TOGGLE_LOCKOUT_MS = 2500;  // v10: ignore toggle for 2.5s after any toggle fires
// v16: Lock threshold lowered from 0.50 to 0.10 — OptiKey freezes cursor INSTANTLY on fixation.
// At 50%, cursor drifted for ~500ms before freezing, causing the "gaze keeps drifting" feel.
// At 10%, cursor freezes within ~100ms of dwell start — nearly instant like OptiKey.
const LOCK_THRESHOLD = 0.10;
const LOCK_BREAK_DISTANCE = 80;  // px to break lock — easier escape since backend handles stickiness

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
  const { settings: dwellSettings } = useDwellTime();
  const dwellSettingsRef = useRef(dwellSettings);
  useEffect(() => { dwellSettingsRef.current = dwellSettings; }, [dwellSettings]);
  const lastNavigationTimestampRef = useRef(gazeControl.lastNavigationTimestamp);
  useEffect(() => {
    lastNavigationTimestampRef.current = gazeControl.lastNavigationTimestamp;
  }, [gazeControl.lastNavigationTimestamp]);
  const CURSOR_SIZE = CURSOR_SIZES[settings.gazeCursorSize] || DEFAULT_CURSOR_SIZE;
  const { isLight, isWarm } = useTheme();
  const isMouseMode = gazeControl.isMouseMode;

  const [x, setX] = useState(window.innerWidth / 2);
  const [y, setY] = useState(window.innerHeight / 2);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [targetName, setTargetName] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);
  const [msgsPerSec, setMsgsPerSec] = useState(0);

  // v16: Visual selection highlight — rectangular border around the element being dwelled on.
  // Provides psychological stability: even if cursor moves slightly, the highlight stays
  // fixed on the correct element, matching Grid 3 / Tobii Communicator / TD Snap behavior.
  const [highlightRect, setHighlightRect] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);

  // Refs for high-performance updates
  const posRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const lockPosRef = useRef({ x: 0, y: 0 });
  const dwellTargetRef = useRef<HTMLElement | null>(null);
  const dwellStartTimeRef = useRef<number>(0);
  const lastClickTimeRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const msgCountRef = useRef(0);
  const lastSecRef = useRef(Date.now());
  const isLockedRef = useRef(false);
  const lastRawPointRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2, t: Date.now() });
  const suppressPullUntilRef = useRef(0);
  const prevBackendOnKeyRef = useRef(false);

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

  // === v17: REPEAT DWELL TRACKING ===
  // Track last selected element to enable faster repeat key presses (OptiKey-style)
  const repeatLastIdRef = useRef<string>('');
  const repeatLastTimeRef = useRef<number>(0);
  const repeatIndexRef = useRef<number>(0);

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

  // Send gaze offset to backend when settings change
  useEffect(() => {
    const offsetX = settings.gazeOffsetX ?? 0;
    const offsetY = settings.gazeOffsetY ?? 0;
    if (ws.setGazeOffset) {
      ws.setGazeOffset(offsetX, offsetY);
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
    isKeyboardScreenRef.current = ws.currentScreen === 'keyboard';
    isCompassScreenRef.current = ws.currentScreen === 'compass-map' || ws.currentScreen === 'advanced-map';
  }, [ws.currentScreen]);

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

  // Find clickable element at point
  const findClickableElement = useCallback((px: number, py: number): { element: HTMLElement | null; isToggle: boolean; isAlwaysActive: boolean } => {
    const elements = document.elementsFromPoint(px, py);

    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.getAttribute('data-cursor') === 'true') continue;

      // Check if always-active (Emergency, Gaze Toggle - respond even when gaze disabled)
      const alwaysActive = isAlwaysActiveElement(el);

      // Check if toggle
      if (isGazeToggleElement(el)) {
        let check: HTMLElement | null = el;
        let depth = 0;
        while (check && depth < 15) {
          const tag = check.tagName?.toLowerCase() || '';
          if (tag === 'button' || check.getAttribute('data-gaze-toggle') === 'true') {
            return { element: check, isToggle: true, isAlwaysActive: true };
          }
          check = check.parentElement;
          depth++;
        }
        return { element: el, isToggle: true, isAlwaysActive: true };
      }

      // Regular clickable
      let check: HTMLElement | null = el;
      let depth = 0;
      let inGazeDisabledZone = false;
      while (check && depth < 15) {
        const tag = check.tagName?.toLowerCase() || '';
        const role = check.getAttribute('role');
        const dataGaze = check.getAttribute('data-gaze');
        const className = check.className || '';

        // Explicit gaze opt-out: data-gaze="false" means this element
        // or zone is mouse-click only (e.g. Settings page content area)
        if (dataGaze === 'false') {
          inGazeDisabledZone = true;
          break; // Entire subtree is gaze-disabled
        }

        const isClickable = (
          tag === 'button' || tag === 'a' || role === 'button' ||
          dataGaze === 'true' ||
          (typeof className === 'string' && (
            className.includes('gaze-button') || className.includes('gaze-card')
          ))
        );

        if (isClickable) {
          // Check if any ancestor opts out of gaze (gaze-disabled zone)
          let ancestor: HTMLElement | null = check.parentElement;
          while (ancestor) {
            if (ancestor.getAttribute('data-gaze') === 'false') {
              inGazeDisabledZone = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (inGazeDisabledZone) break;

          // Check if this clickable element is always-active
          const elementAlwaysActive = isAlwaysActiveElement(check);
          return { element: check, isToggle: false, isAlwaysActive: elementAlwaysActive };
        }
        check = check.parentElement;
        depth++;
      }
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
    const explicitDwellRaw = getAttr(el, 'data-gaze-dwell-ms') || getAttr(el, 'data-gaze-dwell');
    const explicitDwell = explicitDwellRaw ? Number(explicitDwellRaw) : NaN;

    const contextDwell =
      contextKey === 'emergency' || contextKey === 'emergencybutton' ? s.emergencyButton
        : contextKey === 'navigation' || contextKey === 'navigationbutton' ? s.navigationButton
          : contextKey === 'quickfire' ? s.quickfire
            : contextKey === 'keyboard' || contextKey === 'keyboardkey' ? s.keyboardKey
              : contextKey === 'surveyoption' ? s.surveyOption
                : contextKey === 'phrasebutton' || contextKey === 'phrases' ? s.phraseButton
                  : contextKey === 'homescreentile' ? s.homeScreenTile
                    : contextKey === 'spatialzone' || contextKey === 'spatial' ? s.spatialZone
                      : contextKey === 'settingsbutton' || contextKey === 'settings' ? s.settingsButton
                        : contextKey === 'medicalurgent' ? s.medicalUrgent
                          : contextKey === 'backskipbutton' ? s.backSkipButton
                            : contextKey === 'compassmapaction' || contextKey === 'compass' || contextKey === 'compass-map' ? s.compassMapAction
                              : contextKey === 'gazetoggle' ? s.gazeToggle
                                : contextKey === 'standard' || contextKey === 'standardbutton' ? s.standardButton
                                  : null;

    const isNavOnCompass = contextKey === 'navigation' && isCompass;
    let baseDwell = Number.isFinite(explicitDwell) && explicitDwell > 0
      ? explicitDwell
      : isToggle ? s.gazeToggle
        : isNavOnCompass ? Math.max(s.navigationButton, 1400)
          : contextDwell ?? (isKeyboard ? s.keyboardKey : s.standardButton);

    // v17: Variable repeat dwell — faster for repeated presses of same key
    const isKeyboardContext = contextKey === 'keyboard' || contextKey === 'keyboardkey';
    if (s.repeatDwellEnabled && isKeyboardContext) {
      const elId = el.id || '';
      const now = Date.now();
      if (elId && elId === repeatLastIdRef.current && (now - repeatLastTimeRef.current) < (s.repeatWindowMs || 2000)) {
        const times = s.repeatDwellTimes || [0, 250, 350];
        const idx = Math.min(repeatIndexRef.current, times.length - 1);
        const repeatTime = times[idx];
        if (repeatTime > 0) {
          baseDwell = Math.max(200, repeatTime);  // Safety minimum
        }
      }
    }

    return baseDwell;
  }, []);

  const dwellFrame = useCallback(() => {
    const now = Date.now();

    // Mouse-Only Mode: no dwell detection at all
    if (isMouseMode) {
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

    // Cooldown check — uses configurable cooldown from DwellTimeContext
    const s = dwellSettingsRef.current;
    const effectiveCooldown = s.cooldownAfterActivation + 1000; // base 1000ms + configurable
    const inClickCooldown = now - lastClickTimeRef.current < effectiveCooldown;

    // === v17.9: UNIFIED HIT-TEST POSITION (cursor render == hit test) ====
    // CRITICAL FIX for the persistent corner-button loop the patient
    // reported even after v17.5–v17.8. Logs revealed Tobii ET5 frame
    // gaps of 100–500 ms (occasionally multi-second), and the real bug
    // was that the cursor RENDER position (posRef = post-snap, post-EMA,
    // post-R2-anchor) and the HIT-TEST position diverged on keyboard
    // screens: the v18 code used `rawPt` (post-3-tap MA, pre-snap)
    // because of an old concern that EMA lag would cause wrong-key
    // selection during fast scanning.
    //
    // The cost of that divergence was exactly the patient's symptom:
    //   • User sees the cursor sitting on key K (rendered via posRef)
    //   • Raw gaze drifts 30–60 px off K's rect (Tobii ET5 noise)
    //   • Hit test runs on raw gaze → misses K → clickable = null
    //   • Onset target reset → dwell loop forever
    //
    // Unifying on posRef:
    //   • Cursor and hit test are now the SAME point. What you see is
    //     what you select. No more "cursor on K but test off K".
    //   • Pre-onset: posRef ≈ EMA-smoothed gaze with snap applied —
    //     stable representation of where the user is looking.
    //   • Post-onset: posRef ≈ R2 anchor at target center (Option B).
    //   • Frame gaps from the tracker: posRef just stays where it was
    //     until the next gaze sample arrives, so dwell continues
    //     uninterrupted through brief tracking drops.
    //
    // The v18 concern (EMA lag during scanning) is mitigated by the
    // classifier-driven alpha — during saccades alpha jumps to 0.90,
    // so the EMA actually catches up within ~1 frame of a saccade.
    // For ALS users, scanning is slow enough that this works fine.
    const cx = isLockedRef.current ? lockPosRef.current.x : posRef.current.x;
    const cy = isLockedRef.current ? lockPosRef.current.y : posRef.current.y;

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
    const HIT_OFFSET = dwellTargetRef.current ? 70 : 20;
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
    // OptiKey insight: select the element whose CENTER is closest to gaze, not whichever
    // element the cursor pixel happens to be inside. This prevents wrong selections at
    // button edges and boundaries.
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
        const maxRange = Math.hypot(target.rect.width, target.rect.height) * 0.5 + 30;
        if (dist < maxRange && dist < bestDist) {
          bestDist = dist;
          bestTarget = target;
        }
      }
      if (bestTarget?.element) {
        // Verify this element is actually clickable (has data-gaze or is a button)
        const result = findClickableElement(
          bestTarget.rect.left + bestTarget.rect.width / 2,
          bestTarget.rect.top + bestTarget.rect.height / 2
        );
        if (result.element) {
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
          clickable = result.element;
          isToggle = result.isToggle;
          isAlwaysActive = result.isAlwaysActive;
          break;
        }
      }
    }

    // === v17.8: UNIFIED STICKY TARGET (onset + dwell phases, edge-aware) ===
    // Extended from v17.5 to also cover the ONSET phase, which is where
    // the patient's "continuous loop on corner buttons" actually lives.
    // Mechanism:
    //   • In dwell phase (dwellTargetRef.current set): tolerance 35 px,
    //     90 px if button is near a viewport edge (Tobii ET5 noise at
    //     screen corners can exceed 50 px even with EDGE_MODE off).
    //   • In onset phase (only onsetTargetRef.current set): tolerance
    //     60 px, 100 px near edges. Wider because there's no R2 anchor
    //     yet — the onset candidate needs more tolerance to survive
    //     gaze noise until onset completes and Option B kicks in.
    //   • When clickable is already set (hit test found something
    //     valid), sticky doesn't fire — real transitions still win
    //     instantly.
    //   • Adjacent-button risk: keyboard inter-key spacing is ~100 px,
    //     so a 90 px tolerance never reaches another key's center. A
    //     neighbouring key always wins disambiguation via its own
    //     hit test, not sticky.
    if (!clickable) {
      const stickyTarget = dwellTargetRef.current || onsetTargetRef.current;
      if (stickyTarget && stickyTarget.isConnected) {
        const sRect = stickyTarget.getBoundingClientRect();
        if (sRect.width > 0 && sRect.height > 0) {
          const inDwellPhase = !!dwellTargetRef.current;
          // Edge detection — within 80 px of any viewport edge counts as
          // an edge button, where Tobii ET5 noise is empirically worst.
          const EDGE_THRESHOLD_PX = 80;
          const nearEdge = (
            sRect.left < EDGE_THRESHOLD_PX
            || sRect.top < EDGE_THRESHOLD_PX
            || sRect.right > window.innerWidth - EDGE_THRESHOLD_PX
            || sRect.bottom > window.innerHeight - EDGE_THRESHOLD_PX
          );
          // v17.9: tolerances widened slightly to absorb Tobii ET5
          // frame drops (logs show 100–500 ms gaps routinely, with
          // occasional multi-second gaps). During a gap, posRef may
          // be slightly off the rect when the next frame arrives.
          let STICKY_TOLERANCE: number;
          if (inDwellPhase) {
            STICKY_TOLERANCE = nearEdge ? 110 : 50;
          } else {
            STICKY_TOLERANCE = nearEdge ? 130 : 80;
          }
          if (
            cx >= sRect.left - STICKY_TOLERANCE
            && cx <= sRect.right + STICKY_TOLERANCE
            && cy >= sRect.top - STICKY_TOLERANCE
            && cy <= sRect.bottom + STICKY_TOLERANCE
          ) {
            clickable = stickyTarget;
            isToggle = stickyTarget.getAttribute('data-gaze-toggle') === 'true';
            isAlwaysActive = isToggle || stickyTarget.getAttribute('data-gaze-always') === 'true';
          }
        }
      }
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
      // === INCOMPLETE FIXATION TTL ===
      // Save progress when gaze leaves so it can be resumed if user looks back
      let didCaptureSave = false;
      if (dwellTargetRef.current && dwellStartTimeRef.current > 0 && onsetCompletedRef.current) {
        const elapsed = now - dwellStartTimeRef.current;
        const targetContext = (getTargetAttr(dwellTargetRef.current, 'data-gaze-context') || '').trim();
        const contextKey = targetContext.toLowerCase();
        const effectiveDwell = _getEffectiveDwell(dwellTargetRef.current, contextKey, s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
        const currentProgress = Math.min(1, elapsed / effectiveDwell);
        if (currentProgress >= FIXATION_TTL_MIN_PROGRESS && currentProgress < 1) {
          savedDwellRef.current = {
            element: dwellTargetRef.current,
            progress: currentProgress,
            timestamp: now,
          };
          savedDwellExpiryRef.current = now + FIXATION_TTL_MS;
          didCaptureSave = true;
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
      if (!hasActiveSave) {
        setDwellProgress(0);
        setTargetName('');
        setHighlightRect(null);
      }

      frameRef.current = requestAnimationFrame(dwellFrame);
      return;
    }

    // === ONSET DELAY PHASE (OptiKey-inspired two-phase fixation) ===
    // Phase 1: Cursor must remain on SAME element for ONSET_DELAY_MS.
    // No visual feedback during onset — prevents "drive-by" activations.
    if (clickable !== onsetTargetRef.current) {
      // New target — start onset phase
      onsetTargetRef.current = clickable;
      onsetStartTimeRef.current = now;
      onsetCompletedRef.current = false;

      // Check if this is a saved target that can be resumed (fixation TTL)
      if (savedDwellRef.current
        && savedDwellRef.current.element === clickable
        && (now - savedDwellRef.current.timestamp) < FIXATION_TTL_MS) {
        // Resume from saved progress — skip onset since target was already validated
        onsetCompletedRef.current = true;
        const savedProgress = savedDwellRef.current.progress;
        savedDwellRef.current = null;
        // v17.6 Option A: live dwell is taking over; clear the visual
        // continuity expiry so the next save-and-resume cycle starts
        // from a clean slate.
        savedDwellExpiryRef.current = 0;

        dwellTargetRef.current = clickable;
        const effectiveDwell = _getEffectiveDwell(clickable,
          (getTargetAttr(clickable, 'data-gaze-context') || '').trim().toLowerCase(),
          s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
        // Set start time so that progress resumes from saved value
        dwellStartTimeRef.current = now - (savedProgress * effectiveDwell);
        const name = clickable.textContent?.slice(0, 15)?.trim() || clickable.tagName;
        setTargetName(name);
      } else {
        // Fresh onset — clear any saved dwell for different elements
        // v17.6 Option A: also clear the visual-continuity expiry —
        // a different element is now the focus, so the saved visuals
        // should be reset before the new dwell starts drawing.
        if (savedDwellRef.current) {
          savedDwellExpiryRef.current = 0;
          // The line below already clears savedDwellRef in the next
          // statement; calling setDwellProgress(0)/highlight null in
          // the inner `if` block below covers the visual reset.
        }
        savedDwellRef.current = null;
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
      const onsetDuration = isAlwaysActive ? ONSET_DELAY_ALWAYS_ACTIVE_MS : ONSET_DELAY_MS;
      const onsetElapsed = now - onsetStartTimeRef.current;
      if (onsetElapsed < onsetDuration) {
        // Still in onset phase — no visual feedback, no dwell timer
        frameRef.current = requestAnimationFrame(dwellFrame);
        return;
      }
      // Onset completed — transition to dwell phase
      onsetCompletedRef.current = true;
      if (dwellTargetRef.current !== clickable) {
        dwellTargetRef.current = clickable;
        dwellStartTimeRef.current = now;
        setIsLocked(false);
        isLockedRef.current = false;
        const name = clickable.textContent?.slice(0, 15)?.trim() || clickable.tagName;
        setTargetName(name);
        // v16: SNAP CURSOR TO ELEMENT CENTER on dwell start.
        // OptiKey insight: cursor stability comes from freezing at a stable position.
        // Snapping to center gives immediate "locked on target" feel and prevents
        // the cursor from dwelling at the edge of a key/button.
        const rect = clickable.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        posRef.current.x = centerX;
        posRef.current.y = centerY;
        setX(centerX);
        setY(centerY);
        // v16: Show visual highlight around the selected element
        setHighlightRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
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
      // v16: Also snap when dwell target changes mid-fixation
      const rect = clickable.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      posRef.current.x = centerX;
      posRef.current.y = centerY;
      setX(centerX);
      setY(centerY);
      setHighlightRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }

    // Progress — only counts AFTER onset completes
    const elapsed = now - dwellStartTimeRef.current;
    const targetContext = (getTargetAttr(clickable, 'data-gaze-context') || '').trim();
    const contextKey = targetContext.toLowerCase();
    const effectiveDwell = _getEffectiveDwell(clickable, contextKey, s, isToggle, isKeyboardScreenRef.current, isCompassScreenRef.current, getTargetAttr);
    const progress = Math.min(1, elapsed / effectiveDwell);
    setDwellProgress(progress);

    // Progressive lock
    if (progress >= LOCK_THRESHOLD && !isLockedRef.current) {
      isLockedRef.current = true;
      lockPosRef.current = { ...posRef.current };
      setIsLocked(true);
    }

    // Fire click at 100%
    if (progress >= 1 && dwellTargetRef.current) {
      lastClickTimeRef.current = now;
      // v10: Record toggle lockout state before firing
      if (isGazeToggleElement(dwellTargetRef.current)) {
        lastToggleTimeRef.current = now;
        toggleLookedAwayRef.current = false;
      }

      // v17: Track repeat dwell state for faster subsequent key presses
      const elId = dwellTargetRef.current.id || '';
      const repeatWindow = s.repeatWindowMs || 2000;
      if (elId && elId === repeatLastIdRef.current && (now - repeatLastTimeRef.current) < repeatWindow) {
        repeatIndexRef.current++;
      } else {
        repeatIndexRef.current = 1;  // Next press = index 1 (second press)
      }
      repeatLastIdRef.current = elId;
      repeatLastTimeRef.current = now;

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
        const targetLabel = target.id
          || (target.textContent || '').trim().slice(0, 40)
          || target.tagName.toLowerCase();
        recordDwellEvent({
          targetId: targetLabel,
          context: contextAttr,
          screen: ws.currentScreen || 'unknown',
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          center,
          gaze: { x: gaze.x, y: gaze.y },
          onsetToClickMs: onsetStartTimeRef.current > 0 ? now - onsetStartTimeRef.current : 0,
          dwellToClickMs: dwellStartTimeRef.current > 0 ? now - dwellStartTimeRef.current : 0,
        });
      } catch { /* never let telemetry block the click */ }

      dwellTargetRef.current.click();
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
  }, [enabled, isMouseMode, findClickableElement, isGazeToggleElement, getTargetAttr]);

  // Core gaze handler with coordinate transformation
  const handleGaze = useCallback((data: any) => {
    const now = Date.now();
    reportGazeReceived();

    // Rate tracking
    msgCountRef.current++;
    if (now - lastSecRef.current >= 1000) {
      setMsgsPerSec(msgCountRef.current);
      msgCountRef.current = 0;
      lastSecRef.current = now;
    }

    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;

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
    // Matches OptiKey's SmoothWhenChangingGazeTarget: weighted average of current + 2 previous.
    // Reduces directional EMA lag bias by pre-centering the input signal.
    // v16: Extended to ALL screens — cursor stability benefits every screen, not just keyboard.
    const backendOwnsStability = backendLocked || backendOnKey || backendMagnetPx > BACKEND_MAGNET_ACTIVE_PX;
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
      const distFromLock = Math.hypot(rawX - lockPosRef.current.x, rawY - lockPosRef.current.y);
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
            rawX >= tRect.left - LOCK_RECT_TOLERANCE
            && rawX <= tRect.right + LOCK_RECT_TOLERANCE
            && rawY >= tRect.top - LOCK_RECT_TOLERANCE
            && rawY <= tRect.bottom + LOCK_RECT_TOLERANCE
          );
          if (insideTargetRect) {
            shouldBreakLock = false;
          }
        }
      }

      if (shouldBreakLock) {
        isLockedRef.current = false;
        setIsLocked(false);
        dwellTargetRef.current = null;
        dwellStartTimeRef.current = 0;
        setDwellProgress(0);
        setTargetName('');
        setHighlightRect(null);
        posRef.current = { x: rawX, y: rawY };
        setX(rawX);
        setY(rawY);
      }
      return; // Don't move cursor while locked
    }

    // === STATE-AWARE VELOCITY-ADAPTIVE SMOOTHING ===
    const dx = rawX - posRef.current.x;
    const dy = rawY - posRef.current.y;
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
        (posRef.current.x < EDGE_BOOST_ZONE && dx < 0) ||
        (posRef.current.x > window.innerWidth - EDGE_BOOST_ZONE && dx > 0) ||
        (posRef.current.y < EDGE_BOOST_ZONE && dy < 0) ||
        (posRef.current.y > window.innerHeight - EDGE_BOOST_ZONE && dy > 0)
      );
      if (nearEdge) {
        alpha = Math.max(alpha, EDGE_BOOST_ALPHA);
      }
    }

    // Apply EMA
    posRef.current.x += alpha * dx;
    posRef.current.y += alpha * dy;

    // Minimal frontend assist only for gaze-toggle targets.
    // Main magnetism/stability now lives in backend to avoid dual-pull drift.
    if (!backendLocked && !wasSnapped && !suppressFrontendPull) {
      const toggleTargets = snapTargetsRef.current.filter(t => t.priority >= 3);
      let bestToggle: SnapTarget | null = null;
      let bestDist = Infinity;
      for (const t of toggleTargets) {
        const cx = t.rect.left + t.rect.width / 2;
        const cy = t.rect.top + t.rect.height / 2;
        const d = Math.hypot(posRef.current.x - cx, posRef.current.y - cy);
        if (d < bestDist) {
          bestDist = d;
          bestToggle = t;
        }
      }
      const assistRadius = enabled ? 112 : 140;
      const assistStrength = enabled ? 0.12 : 0.18;
      if (bestToggle && bestDist < assistRadius) {
        const cx = bestToggle.rect.left + bestToggle.rect.width / 2;
        const cy = bestToggle.rect.top + bestToggle.rect.height / 2;
        const strength = assistStrength * Math.pow(1 - bestDist / assistRadius, 1.35);
        posRef.current.x += (cx - posRef.current.x) * strength;
        posRef.current.y += (cy - posRef.current.y) * strength;
      }
    }

    // Clamp final position — allow slight overshoot for edge button visibility
    posRef.current.x = Math.max(-30, Math.min(window.innerWidth + 30, posRef.current.x));
    posRef.current.y = Math.max(-30, Math.min(window.innerHeight + 30, posRef.current.y));

    // === v17.3 R2: TWO-PHASE VISUAL ANCHOR =============================
    // Decouples perceived center accuracy from selection accuracy on
    // hardware whose true residual is ≥12–20 px at this viewing distance.
    //
    // Phase A — DWELL ANCHOR (hard snap):
    //   Once onset confirms a dwell target, every frame snaps posRef to
    //   the target's bounding-rect center. This stays in effect through
    //   the rest of the dwell so the cursor visibly "sits" at center
    //   even when the backend lock has clamped at a gaze-corner position.
    //   v17.3: REMOVED the previous !backendLocked guard — when the
    //   backend GravityWell locked at a gaze sample that happened to be
    //   off-center (e.g. corner of a card), the guard caused the cursor
    //   to freeze at that off-center spot. The anchor should override
    //   the backend's visual position regardless.
    //
    // Phase B — ONSET PREVIEW ANCHOR (smooth pull):
    //   During the 250 ms onset phase (before dwell commits), gently
    //   interpolate posRef toward the candidate target's center. The
    //   pull ramps from 0 → ~0.30 between 100 ms and 250 ms of stable
    //   gaze on the candidate. This kills the "drift to corner before
    //   lock-in" panic the patient reported — the cursor visibly
    //   homes in on the key center *during* onset instead of jittering
    //   on the edge.
    //
    // Selection logic remains unaffected throughout: rawX/rawY drive
    // lock-break and the dwellFrame loop's candidate search.
    if (dwellTargetRef.current) {
      const target = dwellTargetRef.current;
      const rect = target.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const anchorX = rect.left + rect.width / 2;
        const anchorY = rect.top + rect.height / 2;
        posRef.current.x = anchorX;
        posRef.current.y = anchorY;
        // Keep the highlight rect synced — covers layout shift mid-dwell.
        setHighlightRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      }
    } else if (onsetTargetRef.current && onsetStartTimeRef.current > 0) {
      // Onset preview: gradually pull cursor toward candidate center.
      // Ramp starts at 100 ms of stable onset, reaches full strength
      // at the standard 250 ms onset completion point.
      const onsetElapsed = now - onsetStartTimeRef.current;
      if (onsetElapsed > 100) {
        const target = onsetTargetRef.current;
        const rect = target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const anchorX = rect.left + rect.width / 2;
          const anchorY = rect.top + rect.height / 2;
          // Ramp from 0 → 1 over 100 → 250 ms onset progress.
          const t = Math.min(1, (onsetElapsed - 100) / 150);
          const pullStrength = 0.30 * t;
          posRef.current.x += (anchorX - posRef.current.x) * pullStrength;
          posRef.current.y += (anchorY - posRef.current.y) * pullStrength;
        }
      }
    }

    setX(posRef.current.x);
    setY(posRef.current.y);
  }, [enabled, reportGazeReceived]);

  // v17: Handle gaze_lost events — pause dwell during blink/stale/gap
  // When backend detects blink or tracking loss, we freeze dwell progress
  // instead of resetting it. This prevents blinks from losing typing progress.
  useEffect(() => {
    const handleGazeLost = () => {
      // If currently dwelling on a target, freeze progress (don't reset)
      // The dwell frame loop will simply not advance until valid gaze returns
      // and the cursor re-enters the same element.
      // No action needed here — the backend already stops sending gaze frames
      // during blink, so dwellFrame won't advance. This event is informational
      // for future use (e.g., showing a "tracking lost" indicator).
    };
    window.addEventListener('gaze_lost', handleGazeLost);
    return () => window.removeEventListener('gaze_lost', handleGazeLost);
  }, []);

  // Startup
  useEffect(() => {
    console.log('[v35] GazeCursor v35 - OptiKey accuracy parity + blink pause + repeat dwell');
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

  return (
    <>
      {/* v16: Visual Selection Highlight — rectangular border around the element being dwelled on.
          Provides psychological stability: the highlight stays fixed on the correct element
          even if the cursor has micro-drift, matching Grid 3 / Tobii Communicator behavior. */}
      {highlightRect && dwellProgress > 0 && (
        <div
          data-cursor="true"
          style={{
            position: 'fixed',
            left: highlightRect.left - 3,
            top: highlightRect.top - 3,
            width: highlightRect.width + 6,
            height: highlightRect.height + 6,
            borderRadius: 8,
            border: `3px solid ${isLocked ? CURSOR_COLOR_LOCKED : CURSOR_COLOR_NORMAL}`,
            backgroundColor: 'transparent',
            pointerEvents: 'none',
            zIndex: 2147483646, // Just below cursor
            boxShadow: `0 0 ${8 + dwellProgress * 12}px ${isLocked ? CURSOR_COLOR_LOCKED : CURSOR_COLOR_NORMAL}40`,
            opacity: Math.min(1, dwellProgress * 3), // Fade in quickly
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}
        />
      )}

      {/* Gaze Cursor */}
      <div
        data-cursor="true"
        className={`gaze-cursor-ring${dwellProgress > 0 ? ' dwelling' : ''}${isLocked ? ' locked' : ''}`}
        style={{
          position: 'fixed',
          left: x - CURSOR_SIZE / 2,
          top: y - CURSOR_SIZE / 2,
          width: CURSOR_SIZE,
          height: CURSOR_SIZE,
          borderRadius: '50%',
          border: `4px solid ${cursorColor}`,
          backgroundColor: dwellProgress > 0
            ? `${cursorColor}20` // 12% opacity
            : `${cursorColor}10`, // 6% opacity
          pointerEvents: 'none',
          zIndex: 2147483647, // MAX Z-INDEX (Cursor must be on top of everything)
          boxShadow: dwellProgress > 0
            ? `0 0 ${15 + dwellProgress * 25}px ${cursorColor}60` // Intense glow
            : `0 0 8px ${cursorColor}30`, // v10: Subtle idle glow — always visible on dark bg
          transition: 'border-color 200ms ease, background-color 200ms ease, box-shadow 200ms ease',
        }}
      >
        {/* Dwell ring */}
        {dwellProgress > 0 && (
          <svg className="dwell-ring-svg" style={{
            position: 'absolute',
            top: -4, left: -4,
            width: CURSOR_SIZE + 8,
            height: CURSOR_SIZE + 8,
            transform: 'rotate(-90deg)',
          }}>
            <circle
              cx={(CURSOR_SIZE + 8) / 2}
              cy={(CURSOR_SIZE + 8) / 2}
              r={(CURSOR_SIZE - 4) / 2}
              fill="none"
              stroke={cursorColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={Math.PI * (CURSOR_SIZE - 4)}
              strokeDashoffset={Math.PI * (CURSOR_SIZE - 4) * (1 - dwellProgress)}
              style={{ transition: 'stroke 200ms ease' }}
            />
          </svg>
        )}

        {/* Center dot */}
        <div
          className={`gaze-cursor-dot${dwellProgress > 0 ? ' dwelling' : ''}${isLocked ? ' locked' : ''}`}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: isLocked ? 24 : (dwellProgress > 0 ? 20 : 8),
            height: isLocked ? 24 : (dwellProgress > 0 ? 20 : 8),
            borderRadius: '50%',
            backgroundColor: cursorColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'width 100ms, height 100ms',
          }} />
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
    </>
  );
};
