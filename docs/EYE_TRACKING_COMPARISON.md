# Eye Tracking Pipeline — Baseline Audit & Comparison

**Status:** Phase 1 baseline (audit + offline metrics). No behavior changes made.
**Branch/commit:** `fix/web_browsing_in_cursor` @ `de1aee6` (clean tree)
**Date:** 2026-06-10
**Goal:** Move toward OptiKey Pro / Tobii Dynavox-level smoothness without regressing the current working app.

---

## 1. Verified pipeline inventory (every stage a gaze sample passes through)

Active path: `optikey_kalman_v1` (`USE_OPTIKEY_PIPELINE=True`, main.py:867).

| # | Stage | Where | Default | Key params |
|---|-------|-------|---------|------------|
| 1 | Tobii LightlyFiltered stream | Program.cs:59-63 | ON (hardcoded) | Tobii-internal filtering; chosen deliberately over Unfiltered (comment: raw jitter caused magnetism drift) |
| 2 | NaN drop + frozen-gaze suppression | Program.cs:112-140 | ON | NaN frames silently dropped; >60 identical frames suppressed (first 60 still forwarded) |
| 3 | Normalize/clamp to primary monitor | Program.cs:121-147 | ON | GetSystemMetrics(0/1); primary monitor only; SetProcessDPIAware (legacy, not per-monitor-v2) |
| 4 | TCP 5555 → Python; margin remap | main.py:493-496 | ON | TOBII_MARGIN_X=0.025 / Y=0.035 linear range expansion |
| 5 | SignalConditioner | signal_conditioner.py | ON | No smoothing. Timestamp normalize, validity gate (conf≤0.3), blink hold ≤150ms, tracking-loss hold ≤500ms (same BLINK label), clamp |
| 6 | Stale TTL / gap hold | main.py:1152-1177 | ON | age>0.150s → drop + `gaze_lost`; gap>0.150s & non-VALID → re-broadcast last payload |
| 7 | Calibration corrector | calibration.py:418-519 | conditional | Only with saved 9-point profile (`~/.gazeconnect/calibration_profile.json`); poly + IDW, stateless |
| 8 | GazeClassifier (I-VT) | gaze_classifier.py | ON | balanced: fixation<65 dps, saccade>150 dps, 5-sample velocity median; sample rate auto-measured |
| 9 | WMA pre-filter (OptiKey SmoothWhenChangingGazeTarget) | one_euro_filter.py:794-868 | ON | weights 0.45/0.30/0.25 |
| 10 | AdaptiveKalmanFilter (OptiKey KalmanFilter.cs port) | one_euro_filter.py:764-911 | ON | state noise fixation=3500 / saccade=200 / glissade=1000; no dt — assumes fixed frame rate |
| 11 | OptiKeyGazeFilter (4-zone damping/lock, GazeFilter.cs port) | one_euro_filter.py:925-1161 | ON | balanced: damping 0.36, fixation_r 0.040, lock_r 0.016, hysteresis ×1.35, min lock 60ms; gap>0.10s in lock/fixation → hold position |
| 12 | Backend on_key hysteresis + 120ms hold | main.py:1425-1505 | ON | enter/exit rect multipliers per context (e.g. keyboard 1.12/1.38) |
| 13 | Backend sticky magnetism + handoff | main.py:1507-1640 | ON | keyboard r=72px pull=0.32 release=88; handoff bias 8px |
| 14 | Broadcast coalescing | main.py:1684-1749 | ON | latest-wins at 66Hz (downsamples ~133Hz input) |
| 15 | FE 3-sample WMA | GazeCursor.tsx:1032-1055 | conditional | skipped when `backendOwnsStability` (backend locked / on_key / magnet>0.8px) |
| 16 | FE semantic snapping | gazeSnapping.ts:147-224 | conditional | fixation-state only; 140px/0.30 base, keyboard 90px/0.10; suppressed when backend locked |
| 17 | FE velocity-adaptive EMA + 8px stable zone + edge boost | GazeCursor.tsx:1150-1214 | ON | alpha: saccade 0.90, fixation 0.36-0.38, <3px 0.16-0.20; edge boost ≥0.55 within 100px of edge |
| 18 | FE toggle assist pull / onset preview anchor / dwell hard anchor | GazeCursor.tsx:1216-1301 | conditional | dwell anchor overrides everything incl. backend lock (v17.3) |
| 19 | FE progressive lock | GazeCursor.tsx:1111-1148 | ON | locks at 10% dwell progress; break needs >80px AND outside rect+45px |
| 20 | FE dwell engine (wall-clock) | GazeCursor.tsx:448-928 | ON | progress = (Date.now() − start)/effectiveDwell; hit test on posRef (v17.9) |

Legacy (inactive, kept as fallback): GazeFilter2D One-Euro → AntiRecoilFilter → GravityWell (`USE_OPTIKEY_PIPELINE=False` path). FixationStabilizer is dead code (imported, never instantiated).

**Backend dwell is doubly vestigial:** `BACKEND_DWELL_ENABLED=False` (main.py:773) AND App.tsx mounts WebSocketProvider without `onDwell*` props. Frontend owns dwell entirely.

### Timestamp story (verified end-to-end)
- .NET sends `timestamp` = Unix **ms** wall clock (Program.cs:150) and `tobii_timestamp` = truncated cast of the Interaction-Library callback double — **units unverified on hardware; do not use until measured**.
- SignalConditioner normalizes by magnitude heuristic to epoch **seconds** (signal_conditioner.py:78-105).
- dt for classifier = successive sample timestamps; staleness/gap = `time.time() − sample.t` (both wall clock — consistent today).
- Frontend uses `Date.now()` everywhere; **no monotonic clocks anywhere** (NTP step / clock drift would corrupt dt, dwell, and TTL simultaneously).
- Kalman, WMA, OptiKeyGazeFilter use **no dt at all** — smoothing strength is frame-rate dependent (133Hz assumed; gaps make one big uncompensated step).

---

## 2. Where the current implementation already matches OptiKey

This repo is substantially an OptiKey port on the backend:
- AdaptiveKalmanFilter is a port of OptiKey `KalmanFilter.cs` (state-adaptive measurement noise).
- WMA pre-filter mirrors OptiKey `SmoothWhenChangingGazeTarget` (0.45/0.30/0.25).
- OptiKeyGazeFilter is a port of OptiKey `GazeFilter.cs` 4-zone damping with lock hysteresis.
- Edge-stability behavior asserted by `python/tests/test_optikey_edge_stability.py` (4/4 pass).

**Key differences from OptiKey (to validate against OptiKey v3.2.5 source before tuning):**
1. OptiKey has **one** smoothing stack. This app stacks Tobii LightlyFiltered + backend (WMA→Kalman→4-zone→magnetism) + frontend (WMA→snap→EMA→stable-zone→anchors→lock). Coordination relies on `backendOwnsStability`/suppression heuristics — 6+ independent pull/smooth layers can act on one frame.
2. OptiKey selects keys from **fixation aggregation** on raw-ish input; this app selects via DOM hit-test of an already triple-smoothed, snapped, anchored point.
3. OptiKey dwell pauses cleanly on signal loss; here frontend dwell **advances on wall clock through blinks/gaps** (see §4).

## 3. Baseline metrics (measured 2026-06-10, offline rig)

Environment: Windows 10 19045, Node 24.13.0, .NET SDK 6.0.428, `python/.venv` = Python 3.9.5 (no pytest — tests run as plain `unittest` scripts; PATH `python` is also 3.9.5; `py -3.12` exists but lacks deps).

### Tests (all existing tests pass except a pre-existing env issue)
| Suite | Command | Result |
|---|---|---|
| OptiKey edge stability | `python\.venv\Scripts\python.exe python\tests\test_optikey_edge_stability.py` | 4/4 OK |
| Pipeline mapping (incl. magnetism, on-key, calibration coords) | `...\python.exe python\tests\test_pipeline_mapping.py` | 9/9 OK |
| Prediction pipeline | `...\python.exe python\tests\test_prediction_pipeline.py` | OK |
| ML training data | `...\python.exe python\tests\test_ml_training_data.py` | FAILS — `torch` not installed (training-only dep; pre-existing, unrelated to gaze) |
| TypeScript | `npm run typecheck` | OK |

### Offline replay baseline (`gaze_trace_replay.py` on `fixtures/synthetic_gaze_trace.csv`, 133Hz, backend pipeline only — no frontend smoothing)
| Segment | RMS px | RMS deg | locked % |
|---|---|---|---|
| stable_fixation | 0.0 | 0.0 | 100.0 |
| tremor_30hz (5px amp) | 9.636 | 0.244 | 94.36 |
| blink_200ms | 0.0 | 0.0 | 100.0 |
| calibration_drift (20px over 2s) | 0.0 | 0.0 | 100.0 |
| slow_pursuit (220px over 4s) | 57.569 | 1.457 | 71.8 |
| saccade (transition) | 161.503 | 4.089 | 0.0 |

Notes: drift RMS 0 + locked 100% means the lock zone fully swallows a 20px drift — good for stability, bad for accuracy (cursor doesn't follow slow drift). `locked 71.8%` during pursuit suggests the filter fights smooth pursuit. Backend per-stage latency ≈ **0.13–0.31ms total** (all 8 stages) — backend compute is NOT the latency problem.

### Corner fixation baseline (added 2026-06-10; generator extended test-only, same 2px input noise as center)
| Segment | RMS px | RMS deg | locked % |
|---|---|---|---|
| corner_tl | 5.906 | 0.149 | 96.98 |
| corner_tr | 9.584 | 0.243 | 96.98 |
| corner_bl | 12.618 | 0.319 | 96.48 |
| corner_br | 9.455 | 0.239 | 96.98 |
| (center stable_fixation, same noise) | 0.0 | 0.0 | 100.0 |

**This is the offline corner-flicker evidence:** identical input noise produces 5.9–12.6px backend output RMS at corners vs 0.0px at center, and the lock engages only ~97% of frames vs 100%. The OptiKey filter's edge zones damp instead of hard-locking at screen boundaries. Any corner fix must push these numbers toward the center values without breaking `test_optikey_edge_stability.py` (edge reachability).

### Not yet measured (requires the real Tobii rig + user)
End-to-end cursor latency p50/p95; real Tobii frame-gap distribution; real WS rate; `window.__gazeTelemetry.snapshot()` after controlled typing; corner dwell reset counts; freeze episodes >200ms; 9-point accuracy. Protocol: see EYE_TRACKING_CHANGES.md §3.

---

## 4. Verified findings (ranked by relevance to reported symptoms)

### Hangs (symptom 2)
1. **TTS blocks the entire backend** — `'speak'` WS handler → `TTSEngine.speak()` → pyttsx3 `runAndWait()` **synchronously on the asyncio loop** (main.py:1786 → 2486-2492 → 683). Every utterance freezes TCP ingest, the gaze pipeline, and the 66Hz broadcast for its full duration. Highest-confidence hang source; hang length should correlate with utterance length. (Synchronous prediction (~13.5ms+30ms neural timeout) and inline file writes add smaller stalls.)
2. **Tracker-silent stalls have no end marker**: .NET drops NaN frames silently with `is_valid` hardcoded `true` (Program.cs:112-115, 177), forwards the first ~60 frozen frames (~0.45–1s) before suppressing (Program.cs:126-140). Python only notices via timing.
3. **Recovery dead-ends**: helper TCP write failure silently stops sending until reconnect (Program.cs:195-208); Python `_reconnect` gives up permanently after ~10s of helper downtime (main.py:427-441, 562-568); port-5555 conflict kills the helper's TCP thread with no retry (Program.cs:236-243).

### Dwell-through-blink (symptoms 2, 3)
4. **Frontend dwell advances on wall clock during tracking loss** — progress = `Date.now()` delta (GazeCursor.tsx:896-900); v17.9 deliberately keeps hit-testing the frozen `posRef` through gaps (471-502). A click can fire mid-blink. The `gaze_lost` listener (1310-1318) is an **empty no-op whose comment incorrectly claims dwell won't advance**. Backend *has* dwell-pause machinery (blink guard, progress retention) but it's disabled (`BACKEND_DWELL_ENABLED=False`) — and contains a latent ms/s unit bug (dwell_detector.py:289 vs 304) plus a pause-without-resume dead-end (354-369), so it is NOT currently a safe drop-in.

### Corner/edge flicker (symptom 1)
5. The v17.9 unified hit-test was itself a corner-loop fix (comment cites real ET5 gaps of 100–500ms). Remaining mechanics: corner = clamp boundary (two axes pinned at 0/1 by .NET clamp + main.py:1124-25) + edge-zone filter behavior + `EDGE_BOOST_ZONE` raising EMA alpha ≥0.55 within 100px of edges (GazeCursor.tsx:1196-1210) — i.e. *less* smoothing exactly where noise hurts most; no corner-specific handling anywhere. Lock-break discards progress entirely (1135-1146) while hit-test-miss saves it for resume (736-754) — inconsistent recovery at noisy corners.

### Filter conflicts (symptom 4)
6. Up to four frontend pull layers (snap, toggle assist, onset anchor, dwell anchor) + backend magnetism can act on one frame; coordination is heuristic (`backendOwnsStability`, 140ms intent bypass). The dwell hard anchor overrides backend lock (v17.3).
7. on_key is evaluated **twice per frame mutating shared hysteresis state** (pre-filter with calibrated coords main.py:1203, post-filter with uncalibrated-path coords 1314); OptiKeyGazeFilter runs on **uncalibrated** coords while its on_key input is **calibrated** (1196-1203 vs 1227-29) — with a strong calibration warp, key-aware damping can engage at the wrong place.
8. `computeSnap` treats a *missing* `gaze_state` as fixation → snapping silently always-on if the field is ever dropped (gazeSnapping.ts:154).

### Render path (symptom 5)
9. Cursor positioned via React state → `left/top` on a fixed div (~30-66 renders/s, layout not compositor) (GazeCursor.tsx:1303-04, 1379-82); `setHighlightRect` allocates a fresh object every frame while dwelling (1281); rAF loop runs up to 13 `elementsFromPoint` probes + `getComputedStyle` z-index ancestor walks per frame on keyboard screens (504-640). No focus/blur handling: if Electron throttles rAF in background, dwell time keeps aging and can fire instantly on refocus.

### Doc/code divergences (trust code, not docs)
- CLAUDE.md says "Emergency 400ms dwell" — **code says emergencyButton default 2000ms, UI min 1400ms** (dwellTimeConfig.ts:61,84; intentionally longer to prevent accidental triggers). The doc claim is stale/wrong.
- AGENTS.md documents `GAZE_DEBUG=1` — **unwired**; high-frequency `[OPTIKEY-GAZE]`/`[CLASSIFIER]`/`[TIMESTAMP]` INFO logs are always-on (no off switch).
- Learning-guide filter params (Kalman 4200/1200, lock 0.020) match **no** current preset; runtime default is balanced (3500/1000/0.016).
- `start-dev.bat --simulate` doesn't simulate at the backend: the SIMULATE var is read by nothing, Electron never passes `--simulate` to Python; mouse-as-gaze comes only from the frontend RealGazeContext 1.5s fallback. Hardware mode silently falls back to simulation on 4 conditions (start-dev.bat:92-121). The gaze payload carries **no simulation marker** — on-rig validation must confirm real-gaze mode via the on-screen indicator (GazeCursor.tsx:1437-56).
- `python/data/smart_bigrams.json` (documented as shipped) does not exist; predictions silently degrade.
- Settings: default `settings.filterPreset='normal'` is an invalid preset name (defaultCustomization.ts:589); custom One-Euro sliders in Settings mutate only the **inactive legacy filter** (main.py:2560-88) — zero live effect; backend preset resets to `balanced` on every backend (re)start and is never re-sent on connect (Electron auto-restarts a crashed backend after 3s).

---

## 5. Switches & presets that exist today (fallback story)

Runtime (no code edit):
- `set_filter_preset` WS message — `stable|balanced|responsive|als_early|als_late` reconfigure classifier+Kalman+OptiKey live (main.py:2503-12, table at 787-833). **Current behavior = `balanced` = default.**
- Dwell settings/presets/ALS stage — localStorage `gazeconnect_dwell_settings` / `gazeconnect_als_stage` via Settings UI.
- Calibration profile — `~/.gazeconnect/calibration_profile.json` (delete to disable).
- Ctrl+Shift+G debug overlay; Ctrl+Shift+M mouse-only mode.

Code-edit-only rollback points (one line each, main.py:766-784, 866-867): `USE_OPTIKEY_PIPELINE`, `BACKEND_DWELL_ENABLED`, `ENABLE_STALE_BLINK_DWELL_GUARD`, `ENABLE_ON_KEY_TARGET_HYSTERESIS`, `ENABLE_MAGNET_STICKY_HANDOFF`, `ENABLE_DUAL_PULL_COORDINATION_SIGNAL`, `ENABLE_ZONE_LOCK_SEMANTICS`, `ENABLE_CLASSIFIER_SCREEN_BASIS`; frontend `ENABLE_DUAL_PULL_REDUCTION` (GazeCursor.tsx:61), `DEBUG_GAZE_LOGS` (useWebSocket.tsx:17).

Gotcha for new presets: `_set_filter_preset` validates against the legacy `FilterPreset` enum **before** `ACTIVE_FILTER_PROFILES` (main.py:2506-09) — a new preset must be added to both.

## 6. Existing instrumentation (use before adding anything)

| Instrument | Access | Measures |
|---|---|---|
| `window.__gazeTelemetry.snapshot()/.events()/.clear()` | DevTools, always on | per-dwell-click residual px (median/MAD/drift), onset→click & dwell→click ms, per-context medians, 250-event ring |
| GazeDebugOverlay | Ctrl+Shift+G (works in prod) | live raw vs smoothed, gaze_state, backend_zone, on_key, magnet px, sample_age_ms (hit-zone subview draws a stale 15px margin — real is 55px) |
| Backend `[LATENCY]` log | always on, every 266 frames | per-stage ms: conditioner/calib/classifier/kalman/filter/map/magnet/send/total |
| Backend `[OPTIKEY]`/`[CLASSIFIER]`/`[GAP-HOLD]`/`[POINT-TTL]`/broadcast-rate logs | always on | zone/lock state, velocity/state, gap holds, stale drops, actual WS msgs/sec every 10s |
| Helper `[QUALITY] Frame gap` + `[GAZE DEBUG]` | always on stdout | inter-frame gaps >50ms, max gap, raw vs normalized coords |
| `gaze_trace_replay.py` | offline CLI | per-label RMS px/deg + locked% through the real backend pipeline |
| Gaze payload fields | every frame to FE | raw/kalman/stable coords, signal_state, classifier state, backend_zone, sample_age_ms, sample_rate_hz, backend_on_key, backend_magnet_px |

Biggest instrumentation gaps vs the target metric list: end-to-end (helper→render) latency, freeze-episode detector (>200ms), corner dwell-reset counter, 9-point accuracy harness (in-app calibration screen exists and can serve), corner-fixation synthetic traces.
