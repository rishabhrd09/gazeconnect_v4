# Eye Gaze Pipeline Learning Guide

> Branch context: `main` (build v4.8.0, gaze pipeline v17.10).
>
> This document is intended to stay in `docs/` as a normal tracked file. It is learning material, branch memory, and a technical handoff note for future commits.
>
> **For the comprehensive end-to-end technical reference covering the v17 pipeline** (architecture, every stage, every constant, dwell state machine, v17.x version history), see the companion HTML textbook: [`eye-tracking-pipeline-textbook.html`](./eye-tracking-pipeline-textbook.html).

## Why this document exists

This branch focused on one hard goal:

- make the eye-gaze experience feel closer to an OptiKey-quality system on Tobii Eye Tracker 5

That means the cursor should not just be "smooth". It should be:

- stable during fixation
- accurate left/right and top/bottom
- easy to move between adjacent targets
- hard to trigger accidentally during blink or stale frames
- reliable for toggles, nav buttons, cards, and keyboard-style targets

The key learning from this work is that gaze accuracy is not one algorithm. It is a contract across the whole pipeline.

## The core mental model

Raw tracker output is not the same thing as user intent.

The system has to turn:

- noisy samples
- occasional blinks
- frame gaps
- systematic bias
- coordinate mismatches
- target competition

into:

- a stable cursor
- a believable lock state
- a fair dwell state
- a predictable path into UI targets

The most important design choice in this branch is:

- the backend owns truth for stability and target intent
- the frontend should mostly render, lightly assist, and avoid fighting backend decisions

## End-to-end flow

The current flow (v17) is best understood as this:

```text
TobiiHelper sample (LightlyFiltered mode, ~133 Hz)
  ->
timestamp normalization + Tobii range expansion
  ->
SignalConditioner
  - validity
  - blink hold
  - out-of-bounds handling
  - frozen detection
  - stale sample guard
  ->
coordinate mapping
  - full screen normalized
  - window-content normalized contract
  - manual gaze offset (backend only — no frontend offset)
  ->
optional calibration correction
  - polynomial correction
  - residual IDW refinement
  ->
gaze classification
  - fixation / glissade / saccade
  ->
state-aware OptiKey-style filtering
  - Kalman (fixation noise=4200, saccade=200)
  - OptiKey 4-zone filter (LOCK/KEY/FIXATION/FREE)
  - context-aware lock radius (keyboard=0.020, default larger)
  ->
backend target reasoning
  - on-key detection (uses post-filter pixel coords)
  - context-specific magnetism (keyboard/prediction/nav/toggle)
  - sticky target handoff with 8px bias
  - hysteresis with entry/exit sizing per context
  ->
WebSocket payload
  - normalized window coordinates (coord_space: "window")
  - backend zone + fixation/lock state
  - backend_on_key, backend_magnet_px hints
  ->
frontend cursor (GazeCursor.tsx)
  - 3-sample pre-smoothing (0.45/0.30/0.25 weighted average)
  - velocity-adaptive EMA (fixation alpha 0.38 keyboard, 0.45 other)
  - saccade bypass for movements >34px
  - semantic snapping (context-aware: keyboard/prediction/toggle/general)
  ->
frontend element selection
  - nearest-center selection (keyboard: findBestKeyboardKey with 35px margin)
  - nearest-center selection (other screens: snap target distance scoring)
  - overlay-aware filtering (v17: detects high-z overlays, skips hidden elements)
  ->
dwell + visual feedback
  - snap-to-center on dwell start (cursor jumps to element center)
  - rectangular highlight border around selected element
  - lock threshold 0.10 (~100ms to freeze)
  - onset delay 250ms (prevents drive-by activations)
  - incomplete fixation TTL 1000ms (preserves progress during brief excursions)
```

## Coordinate-space lesson

One of the biggest sources of "bad accuracy" is not the tracker. It is coordinate-space mismatch.

We now treat this as an explicit contract:

- backend emits `coord_space: "window"` for gaze payloads
- renderer interprets `x/y` as already normalized to app content area
- legacy `screen` handling remains as fallback only

Important distinction:

- tracker samples begin in full-screen normalized space
- UI interaction happens in window-content space
- classifier velocity basis should use screen-space dimensions
- dwell and target hit-testing should use window pixel space

If these spaces get mixed, symptoms look like:

- persistent left/right bias
- edge targets that never feel reachable
- cursor that looks correct in one layout and wrong in another
- lock zones that do not match visible targets

## Core concepts used

### 1. Freshness matters more than raw validity

A sample can be technically valid and still be unsafe for dwell.

Examples:

- a blink-hold sample that should preserve cursor continuity
- a stale sample that arrived too late
- a frozen sample that keeps the cursor still but should not drive activation

Learning:

- cursor continuity and dwell eligibility must be treated separately

### 2. Calibration corrects bias, filters correct noise

Calibration helps with systematic offset.
Filtering helps with frame-to-frame instability.

They solve different problems and should not be asked to replace each other.

### 3. Classification basis must match the tracker basis

Velocity thresholds only work if the classifier measures movement in the correct pixel basis.

If the classifier uses the wrong basis:

- fixation can look like saccade
- glissade can stay too long
- lock behavior becomes inconsistent across DPI/window setups

### 4. Lock should protect intent, not trap the user

Good lock behavior means:

- calm during fixation
- stable during dwell buildup
- easy to break during a real move to the next target

Bad lock behavior feels like:

- sticky prison during adjacent button changes
- cursor hanging on the previous target
- failure to release after intention changes

### 5. Hysteresis should be short, local, and target-aware

We use hysteresis to stop flicker, not to manufacture stickiness.

Target-aware hysteresis is better than global hysteresis because:

- keyboard-like targets need tighter entry and controlled exit
- gaze toggles need larger capture
- navigation wants faster release than keyboard typing

### 6. Dual pull is a real failure mode

When backend magnetism and frontend snapping both pull at the same time:

- motion feels heavy
- transitions between cards feel sticky
- cursor may lag or "hang"

Learning:

- if backend already has target intent, frontend should back off

### 7. Edge behavior needs explicit handling

Trackers often under-reach the physical edges.
General smoothing also tends to pull inward.

So edges need:

- tracker range expansion
- boundary passthrough
- reduced edge lockiness
- direct route to edge buttons and corners

## OptiKey-inspired principles used here

This branch adopted a set of OptiKey-style ideas rather than relying on one generic smoother:

- state-aware filtering instead of one fixed smoothing level
- zone-based damping near targets
- lock semantics with hysteresis
- incomplete-fixation tolerance
- backend-first target intent
- keyboard-aware and context-aware target behavior

In practice, that means the pipeline is trying to distinguish:

- "this is just fixation tremor"
- "this is post-saccade settling"
- "this is a deliberate move to a new target"

That distinction is more important than simply lowering jitter.

## What changed in this branch

### Mapping and coordinate contract

- standardized backend payloads around `coord_space = "window"`
- aligned renderer mapping logic with backend contract
- preserved legacy screen fallback only for safety
- **fixed double-offset bug**: manual gaze offset was applied in both backend AND frontend (effectively doubling it). Now applied in backend only.

Outcome: lower mismatch risk, no more doubled offsets

### Tobii mode upgrade

- changed from unfiltered to `GazePointDataMode.LightlyFiltered` in C# bridge
- applied Tobii margin expansion before later stages

Outcome: cleaner raw signal, better edge reach

### Stale/blink dwell guard

- separated visual continuity from activation eligibility
- backend dwell updates now reject blink/frozen/stale style progression paths

Outcome: fewer false activations, safer dwell during blink or frame drops

### Classifier basis correction

- updated classifier basis to use screen-oriented sizing
- added feature flag for rollback safety

Outcome: more reliable fixation/saccade classification

### OptiKey 4-zone filter (backend)

- replaced simpler Gravity Well with full OptiKey-style 4-zone system: LOCK/KEY/FIXATION/FREE
- context-aware zone radii: keyboard gets tighter lock (0.020 ≈ 38px)
- hysteresis multiplier 1.7 for keyboard, reduced from 2.0

Outcome: cursor feels stable during selection, lock behavior matches visible targets

### On-key hysteresis by target

- target-aware hold model with entry/exit sizing per context
- on-key detection fixed to use post-filter pixel coords (was using pre-filter Kalman coords, causing coordinate mismatch)
- backend magnetism tuned per context: keyboard radius 72px/pull 0.32, prediction 112px/0.48

Outcome: less flicker, easier acquisition without excessive stickiness

### Sticky magnet handoff

- adjacent-target handoff with 8px bias (reduced from 14px)
- prevents old-target loyalty from lingering too long

Outcome: less friction between neighboring buttons

### Frontend dual-pull reduction

- backend emits coordination hints: `backend_on_key`, `backend_magnet_px`, `backend_zone`
- frontend snapping always enabled (was suppressed when backend_on_key=true, removing center-pull when most needed)
- keyboard snap strength reduced to 0.10 (from higher) to avoid compound pull with backend

Outcome: less hang, less rubber-band feel, cleaner motion

### Nearest-center element selection (v16)

- **fundamental algorithm change**: replaced `elementsFromPoint()` hit test with nearest-center selection
- keyboard uses `findBestKeyboardKey()` with 35px expanded hit zones
- other screens use snap target distance scoring
- prevents wrong selections at button edges and in gaps between keys

Outcome: dramatically reduced mis-selections, especially on keyboard

### 3-sample pre-smoothing (v16)

- OptiKey's `SmoothWhenChangingGazeTarget` ported to frontend
- 3-sample weighted average (0.45/0.30/0.25) applied before EMA
- active on ALL screens (was keyboard-only)

Outcome: reduced single-sample jitter spikes

### Snap-to-center lock + visual highlight (v16)

- on dwell start, cursor jumps to element center
- rectangular highlight border appears around the element
- lock threshold lowered from 0.50 to 0.10 (cursor freezes in ~100ms vs ~500ms)

Outcome: eliminates "drift during dwell" — user knows exactly which element is selected

### Screen-specific data-gaze attributes (v16)

- FeelingScreen, PeopleScreen: added `data-gaze="true"` and `data-gaze-context="phraseButton"` to custom buttons that bypassed GazeButton
- QuickWord dwellCategory mapped to `'quickfire'` context (was unmapped, fell through to 'navigation')

Outcome: all screens now fully gaze-accessible

### Overlay-aware gaze selection (v17)

- GazeCursor detects high-z-index overlays (e.g., QuickWords modal on keyboard screen)
- when overlay detected, skips keyboard-specific hit zone path
- filters snap targets by visibility using `elementFromPoint` at each target center
- hidden elements behind overlays are excluded from selection

Outcome: QuickWords overlay buttons properly selectable with gaze on keyboard screen

### Web browsing gaze improvements (v17)

- BrowserView cursor update rate: 80ms (12fps) → 33ms (30fps)
- "Click Here" gaze button added to YouTube, QuickSearch, Social, News panels
- edge-scroll visual indicators (teal gradient) added to YouTube, Social, News panels
- all BrowserView panels now have consistent gaze control toolbar

## Files that matter most

### Hardware bridge

- `tobii-helper/TobiiGazeHelper/Program.cs` — LightlyFiltered Tobii stream, TCP to Python

### Backend pipeline

- `python/main.py` — coordinate mapping, magnetism, on-key detection, WebSocket
- `python/services/one_euro_filter.py` — One Euro, Kalman, Anti-Recoil, OptiKey 4-Zone
- `python/services/signal_conditioner.py` — validity, blink hold, stale guard
- `python/services/gaze_classifier.py` — fixation/saccade/glissade classification
- `python/services/calibration.py` — polynomial + IDW correction
- `python/services/dwell_detector.py` — server-side dwell detection

### Frontend cursor and interaction layer

- `src/components/core/GazeCursor.tsx` — pre-smoothing, EMA, nearest-center, snap-to-center, overlay detection
- `src/components/core/GazeButton.tsx` — dwell timing, onset delay, context mapping
- `src/utils/gazeSnapping.ts` — context-aware semantic snapping
- `src/utils/hitZoneExpansion.ts` — center-weighted keyboard hit zones
- `src/hooks/useWebSocket.tsx` — WebSocket connection and gaze data subscription
- `src/components/core/GazeControlToggle.tsx` — gaze enable/disable state
- `src/screens/WebBrowsingScreen.tsx` — BrowserView gaze cursor, dwell-click, edge-scroll
- `src/hooks/useGazeBrowser.ts` — BrowserView coordinate mapping
- `electron/main.ts` — injected dwell-click in BrowserView, edge-scroll, trusted click events

### Regression coverage

- `python/tests/test_pipeline_mapping.py`
- `python/tests/test_optikey_edge_stability.py`

## Feature flags and rollback points

The branch intentionally kept major behavior changes reversible.

Important backend flags in `python/main.py`:

- `ENABLE_STALE_BLINK_DWELL_GUARD`
- `ENABLE_CLASSIFIER_SCREEN_BASIS`
- `ENABLE_DUAL_PULL_COORDINATION_SIGNAL`
- `ENABLE_ZONE_LOCK_SEMANTICS`
- `ENABLE_ON_KEY_TARGET_HYSTERESIS`
- `ENABLE_MAGNET_STICKY_HANDOFF`

Important frontend flags in `src/components/core/GazeCursor.tsx`:

- `ENABLE_DUAL_PULL_REDUCTION`

Why this matters:

- we can tune or disable one concept without throwing away the whole branch

## Reliability rules learned from the work

These rules are worth preserving:

1. Never change multiple pull layers upward at the same time.
2. Treat dwell safety separately from cursor continuity.
3. Fix coordinate contracts before tuning thresholds.
4. Prefer backend target intent over frontend guessing.
5. Use context-aware hysteresis instead of broad global stickiness.
6. Add a regression test whenever a tuning change addresses a real symptom.

## How to evaluate the system correctly

Do not judge accuracy only by raw smoothness.

Judge it by these user-facing behaviors:

- fixation drift
- left/right deviation from intended point
- lock stability while selecting
- friction between adjacent targets
- toggle and edge acquisition difficulty

A system can look smooth and still be wrong if it:

- drifts slowly
- holds too long
- misses edges
- needs too much effort to switch targets

## Tests added in this branch

The learning from this branch is encoded in tests, not just prose.

Key regression themes now covered:

- window mapping correctness
- calibration correction locality
- stale/blink dwell guarding
- classifier basis correctness
- dual-pull coordination payload
- on-key release timing
- sticky magnet handoff
- edge stability and passthrough

## Practical tuning guidance for future work

If a future developer sees a problem, tune in this order:

1. verify coordinate space
2. verify sample freshness
3. verify classifier basis
4. verify backend zone and on-key state
5. only then tune magnetism or frontend snapping

Avoid this common mistake:

- increasing frontend snap to compensate for backend uncertainty

That usually creates a temporary feeling of stronger targeting, but later becomes:

- friction
- mis-locking
- harder target-to-target transitions

## Current branch outcome

This branch is no longer just "more smoothing".
It is a full OptiKey-grade eye-gaze intent pipeline with:

- clearer coordinate contracts (single-point offset, window-normalized space)
- safer dwell behavior (onset delay, fixation TTL, stale/blink guard)
- more correct classification basis (screen-oriented sizing)
- OptiKey 4-zone backend filtering with context-aware parameters
- nearest-center element selection (replaces point-in-rect hit test)
- snap-to-center lock with visual highlight on dwell start
- 3-sample pre-smoothing on all screens
- overlay-aware gaze selection (QuickWords, modals)
- reduced backend/frontend dual-pull conflict
- consistent gaze control across all BrowserView panels
- stronger regression protection

## Validation commands

Use these commands when validating or before a commit:

```powershell
npm run typecheck
python -m py_compile python/main.py python/services/one_euro_filter.py
python -m unittest python.tests.test_pipeline_mapping python.tests.test_optikey_edge_stability
```

## Final takeaway

The most important lesson from this branch is simple:

eye-gaze accuracy is a system property, not a single filter setting

If the pipeline honors coordinate truth, sample freshness, classifier basis, target intent, and lock-release balance together, the user experience improves sharply.
If any one of those layers lies, the whole interaction feels inaccurate even when the tracker itself is good.

---

## Supplement — the v17.x sub-series (May 2026)

After the initial v17 work this document describes, a deeper debugging campaign drove ten further refinements (v17.1 → v17.10), all in `main`. The deeper-than-expected problem turned out to be hardware-floor noise on the Tobii ET5 and a cursor-vs-hit-test position mismatch. The v17.x series each addresses one specific failure mode that emerged during clinical use with the patient.

### What v17.x added on top of v17

- **v17.3 — R2 visual anchor** (`GazeCursor.tsx`). The single biggest change. Once dwell onset commits, `posRef` is forced to the dwell target's bounding-rect centre every frame for the rest of the dwell. The cursor visibly "sits" at the target centre regardless of raw-gaze noise. Selection logic still reads raw gaze for lock-break and target-change detection, so this is purely a presentation/perception change — but on hardware with 12–20 px residual it transforms the felt accuracy.

- **v17.3 — Onset preview anchor** (`GazeCursor.tsx`). During onset (100–250 ms before dwell commits), the cursor is gently pulled toward the candidate's centre with pull strength ramping 0 → 0.30. Kills the "cursor drifts to corner before lock" panic that was reported on Home cards.

- **v17.6 — Visual continuity layer** (`GazeCursor.tsx` + `electron/browser/browserGazeController.ts`). The savedDwell mechanism preserves *logical* dwell progress when gaze briefly leaves a target — but the visual ring used to reset to 0, creating a perceived "loop". v17.6 decouples them: ring and highlight stay visible at their last value during the 1000 ms grace, only clearing if grace expires.

- **v17.7 — Anchored hit test (Option B)** (`GazeCursor.tsx`). Once a dwell target is committed, the multi-point hit test runs against `posRef` (the R2-anchored cursor) instead of raw gaze. The cursor is already at target centre, so the hit test always finds the target — eliminating the "cursor on K but underlying selection off K" mismatch that caused infinite loops.

- **v17.8 — Onset-phase sticky + keyboard margin 55** (`GazeCursor.tsx`, `hitZoneExpansion.ts`). Sticky tolerance now also covers the onset phase (60 px standard, 100 px edge-aware) so onset doesn't reset on a single noisy frame. `KEYBOARD_SNAP_MARGIN` raised 35 → 55 to absorb edge-key noise (A, Z, P, ?). Snap-targets-nearest-center now runs as a fallback even on keyboard screens, so non-keyboard buttons like "Word", "Quick Phrases", and prediction-strip phrases get the same generous nearest-center treatment.

- **v17.9 — Unified hit test on posRef** (`GazeCursor.tsx`). Removed the v18 special case that used raw-gaze for keyboard hit testing. The cursor render position and the hit-test point are now literally the same. What you see is what you select.

- **v17.10 — Lock-break gated by target rect** (`GazeCursor.tsx`). The most important late fix. Lock-break used to fire on raw-gaze noise (Tobii ET5 produces 50–80 px noise during legitimate fixation, especially at edges). The fix gates lock-break on a second condition: raw gaze must also be outside the dwell target's rect + 45 px tolerance. Verified by frame-by-frame video analysis to eliminate the "90% dwell abort" bug on letter keys and the 15-second loop on Assistance-screen cards.

- **R1 (audit) — Telemetry** (`src/utils/gazeTelemetry.ts`). New module. Records every dwell-click with target id, rect, gaze residual, and timing. Exposed via `window.__gazeTelemetry.snapshot()`. Companion BrowserView telemetry via `window.__gcTelemetry`. Provides objective accuracy numbers for tuning future iterations without subjective guesswork.

- **R8 (audit) — Bayesian YouTube card posterior** (`electron/browser/browserGazeController.ts`). Replaces nearest-distance card resolution in the BrowserView with a Gaussian-likelihood posterior over visible cards, temporally smoothed across frames. σ = 46 px, α = 0.32, commit threshold 0.45. A single noisy gaze sample cannot flip the winning card.

- **Asymmetric snap/unsnap** (Tobii Dynavox US10,890,967 pattern) applied to BrowserView YouTube targets: card snap-in 130 / unsnap 230, skip-ad snap-in 140 / unsnap 250.

- **Auto-enable gaze** on AlertModeScreen and embedded-browser views — the patient was getting stuck with gaze toggle off on these screens.

### What's *un*changed (the principles still hold)

- "Backend owns truth for stability; frontend renders and lightly assists" — unchanged.
- The classifier thresholds (65 / 150 °/s) — unchanged. The audit recommends adaptive thresholding (R5) but it's deferred until R1 telemetry has been collected from a real session.
- The 3-tap MA — still in place. Audit R3 (remove it) was deferred for the same reason.
- All dwell timings (250 ms onset, 1000 ms dwell, 1300 ms cooldown) — unchanged.

### What to read next

1. **[`eye-tracking-pipeline-textbook.html`](./eye-tracking-pipeline-textbook.html)** — the comprehensive technical reference covering the full v17.10 pipeline end to end, with Mermaid diagrams.
2. **[`gaze-accuracy-and-word-prediction-guide.md`](./gaze-accuracy-and-word-prediction-guide.md)** — Part 4 "Recent Changes" was extended in parallel with this supplement.
3. **The accuracy audit** — the research-grade audit document that drove R1, R2, R6, R8. (Conversation history; consider archiving to docs/.)
