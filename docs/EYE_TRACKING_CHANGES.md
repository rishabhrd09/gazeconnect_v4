# Eye Tracking Changes Log

Companion to [EYE_TRACKING_COMPARISON.md](EYE_TRACKING_COMPARISON.md) (baseline audit + metrics).
Rule: **one variable at a time, behind a preset/flag, default = current behavior, measured before/after.**

---

## Entry 0 — 2026-06-10 — Baseline established (NO behavior changes)

**Changed:** nothing in app code. Added the two docs in `docs/`. Ran existing tests and the offline replay harness; recorded results in EYE_TRACKING_COMPARISON.md §3.

**Verified rollback story (the "one switch"):**
- Current working behavior is the **default**: backend preset `balanced` + all `ENABLE_*` flags at shipped values + frontend constants as-is. Nothing needs to be flipped to get today's behavior.
- Every future behavioral change must land as either (a) a **new** entry in `ACTIVE_FILTER_PROFILES` + `FilterPreset` enum (both required — main.py:2506-09 validates the enum first), selectable/revertible at runtime via the `set_filter_preset` WS message, or (b) a new `ENABLE_*`-style flag defaulting to current behavior.
- Hard fallback (code-level, one line each): `USE_OPTIKEY_PIPELINE=False` reverts the whole backend filter chain to the legacy One-Euro path; `ENABLE_*` constants at main.py:766-784 roll back individual behaviors; `ENABLE_DUAL_PULL_REDUCTION` (GazeCursor.tsx:61) on the frontend.
- Full rollback of any committed change: `git revert <commit>` — baseline commit is `de1aee6`.

**Baseline results (details in COMPARISON §3):** 4/4 edge-stability, 9/9 pipeline-mapping, typecheck OK; replay: tremor RMS 9.64px/0.244° (94.4% locked), pursuit RMS 57.6px (71.8% locked), fixation/blink/drift RMS 0. Backend pipeline compute ≤0.31ms/frame. `test_ml_training_data.py` fails pre-existing (`torch` missing — training-only).

---

## Entry 1 — 2026-06-10 — TTS moved off the event loop (env-gated, default OFF)

**Symptom:** cursor/dwell hangs (baseline finding #1: `pyttsx3 runAndWait()` runs synchronously on the asyncio loop — every utterance froze TCP ingest + pipeline + broadcast for its full duration).
**Change:** `python/main.py` TTSEngine — `GAZECONNECT_TTS_ASYNC=1` (env var) routes speak/rate/volume through a dedicated daemon worker thread that owns the engine (SAPI5 thread affinity). `stop` drains the queue and interrupts. Env unset = byte-for-byte the original synchronous path.
**Measured:** smoke test — async mode blocks the main thread **3.7ms** per speak call (vs full utterance duration). On-rig confirmation pending (protocol step 8).
**Rollback:** unset `GAZECONNECT_TTS_ASYNC` (or set to 0) and restart the backend.

## Entry 2 — 2026-06-10 — Runtime gaze flags + dwell pause-on-gap (flag, default OFF)

**Symptom:** dwell advances on wall clock through blinks/gaps (baseline finding: click can fire mid-blink; `gaze_lost` handler is a no-op).
**Change:** new `src/utils/gazeFlags.ts` — persisted runtime switches, togglable in DevTools (`window.__gazeFlags.set/get/reset`), no code edit needed. Flag `dwellPauseOnGap`: in GazeCursor, while gaze is stale (no frame >150ms, matching backend TTLs) or `signal_state` ≠ 'valid' (blink/oob/frozen), all dwell clocks (dwell start, onset start, saved-progress TTL, resume window) shift forward by the frame dt — progress neither advances nor resets. Guards: requires ≥1 real gaze frame received (mouse-sim sessions unaffected); flag OFF = exact current behavior (timer code untouched when disabled).
**Measured:** typecheck + all suites pass; behavioral effect needs on-rig A/B (blink mid-dwell: baseline clicks through, flagged build pauses).
**Rollback:** `window.__gazeFlags.set('dwellPauseOnGap', false)` or `.reset()`.

## Entry 3 — 2026-06-10 — Lock-break progress retention (flag, default OFF)

**Symptom:** corner flicker — at corners, raw-noise excursions break the progressive lock and discard all dwell progress (the hit-test-miss path saves progress for 1s resume; the lock-break path didn't).
**Change:** GazeCursor lock-break path — flag `lockBreakProgressRetention`: on lock break, save progress into the existing fixation-TTL store (same `savedDwellRef` mechanism, same 1s TTL, same ≥5% minimum) and keep the ring/highlight visible (v17.6 Option A semantics). Flag OFF = baseline discard.
**Measured:** offline corner baseline now exists (COMPARISON §3: corners 5.9–12.6px RMS / ~97% lock vs 0px / 100% center). On-rig metric: `interrupts.byKind.lock_break` and resets-per-selection from telemetry, corners vs center.
**Rollback:** `window.__gazeFlags.set('lockBreakProgressRetention', false)` or `.reset()`.

## Entry 4 — 2026-06-10 — Instrumentation: freeze + dwell-interruption telemetry (always-on, measurement only)

**Why:** acceptance criteria require evidence for "no freeze >200ms" and "corner flicker reduced" — neither was measurable.
**Change:** `src/utils/gazeTelemetry.ts` + GazeCursor: (a) freeze ring — gaze-stream gaps >200ms (`gaze_gap`) and rAF-loop stalls >200ms (`raf_stall`); (b) dwell-interruption ring — `lock_break` / `target_lost` / `expired` / `resumed` events with progress + nearEdge (80px) classification. New DevTools surface: `window.__gazeTelemetry.snapshot()` now includes `interrupts` (total, byKind, nearEdgeCount, perClick) and `freezes` (count, over200Count, maxMs, byKind); raw rings via `.interruptions()` / `.freezes()`. Recording is try/catch-wrapped ring pushes — no behavior change.
**Rollback:** none needed (pure measurement); `git revert` if unwanted.

## Entry 5 — 2026-06-10 — Corner segments in synthetic traces (test-only)

`python/tests/gaze_synthetic_traces.py` now emits 4 corner fixations (1.5s each, same 2px sigma as center) + labeled transitions; fixture regenerated. Existing segment metrics are unchanged (same seed). This is the offline corner A/B rig.

---

## On-rig A/B results — 2026-06-11 (real Tobii ET5, developer as test user)

Session A: baseline (flags off, sync TTS), 00:13–00:25, 71 clicks. Session B: `GAZECONNECT_TTS_ASYNC=1` + both flags on, ~01:59–02:05, 34 clicks. Same exercise. Snapshots + console logs: `session-A*.txt` / `session-B*.txt` (repo root, not committed).

| Metric (per-click normalized where rates) | A (baseline) | B (flags on) | Read |
|---|---|---|---|
| gaze-stream gaps >200ms | 47 (0.66/click), max **30.6s** | 6 (0.18/click), max 3.6s | −73%; confounded by look-aways (gaze_gap can't distinguish backend stall from user looking off-screen) |
| stale-sample drops (`[POINT-TTL]`, unambiguous backend-stall evidence) | 1 drop @ **5.3s** age | 0 | backend stalls eliminated in B |
| TTS during session | backend speak never fired (chat_history empty for A) | speak fired 02:01:55 via async worker; `[LATENCY]` cadence ticked 02:01:52→:00→:08 uninterrupted | **async TTS verified end-to-end on rig**; A-side speech counterfactual not captured (A never backend-spoke) |
| lock-breaks | 55 (0.78/click), 31 near edge | 19 (0.56/click), 10 near edge | −28%/click |
| resumes after lock-break | n/a (discard) | 2 | retention works but rarely rescues — most breaks are likely intentional gaze departures |
| max click residual | **479.8px** (a mid-gap/mid-blink misfire) | 108.7px | the A outlier is exactly the failure mode `dwellPauseOnGap` prevents (n=1, suggestive) |
| median residual / keyboard median | 31.1 / 33.1px | 43.8 / 44.3px | **worse in B — but confounded**: B typed with DevTools docked (app squeezed ~1365px → smaller keys), ~2AM fatigue, drift vector grew to (−8.8,−22.3) suggesting head-position/calibration shift. Needs controlled re-check before judging the flags |
| median acquisition | 1751ms | 1751ms | identical (sanity check — dwell config unchanged) |

Verdict: TTS async = clear keep (zero observed cost, verified live). Flags = promising on interruption metrics, accuracy re-check required under controlled conditions (daytime, DevTools closed, same calibration) before considering default-on.

Also observed live in B's console: `[GAZE-OFFSET] Manual offset set: X=0.0px Y=0.0px` spams many times/second during typing — confirms the audited risk that GazeCursor re-sends `set_gaze_offset` on every WS-context re-render (predictions updates). Harmless to gaze math but wasteful (WS traffic + log I/O). Candidate next small fix: gate the send on value change.

## Real-rig baseline protocol (run before any tuning; needs the user at the Tobii)

1. `.\start-dev.bat` — confirm console prints `Build OK.` AND does **not** print any "Falling back to simulation mode" line (four silent-fallback paths exist: start-dev.bat:92-121).
2. Confirm real-gaze mode in-app: bottom-left status indicator must show real gaze (not mouse-sim) and >25 msg/s (GazeCursor.tsx:1437-56). There is no payload-level simulation marker — the indicator is the only check.
3. Capture from the Python console after ~5 min of normal use:
   - `[LATENCY]` lines (per-stage ms) — expect ≈0.2ms total
   - `Gaze broadcast rate` lines (actual WS msgs/sec, every 10s)
   - `[GAP-HOLD]` / `[POINT-TTL]` counts
   - sample_rate_hz from any `[PIPELINE]` context (also in payload) — establishes whether the ET5 delivers ~33/66/133Hz here
   - Helper window: `[QUALITY] Frame gap` lines + max gap
4. Controlled typing test: type a fixed pangram twice on the keyboard screen, then in DevTools run `window.__gazeTelemetry.snapshot()` and save the JSON (median residual px, MAD, drift, acquisition ms, per-context). Save as `docs/baselines/telemetry-baseline-<date>.json`.
5. Corner test: type 10 characters using only corner/edge keys (Q, P, Z, M, backspace) with Ctrl+Shift+G overlay on; note dwell-ring resets per selection (count manually or from snapshot per-target events) and any visible flicker between adjacent targets.
6. 9-point accuracy: run the in-app calibration screen once *without saving* (or read its per-point error logs `[CALIB]` — per-point offset px is logged) for a 9-point accuracy read, especially corners.
7. Hang watch: note any cursor freeze >200ms and what was happening (speaking? predictions? blink?). Expect freezes during TTS utterances (verified blocking call — COMPARISON §4.1).
8. TTS hang confirmation (2 min): have the app speak a long sentence while moving gaze — if the cursor freezes for the utterance duration, finding #1 is confirmed on-rig.

## Planned change ladder (each gated on the rig baseline above; one at a time)

| # | Change | Status | Mechanism | Measure |
|---|--------|--------|-----------|---------|
| 1 | Move TTS `speak()` off the event loop | **DONE (Entry 1)** | `GAZECONNECT_TTS_ASYNC=1`, default off | hang episodes during speech before/after |
| 2 | Debug-gate the always-on per-frame INFO logs (wire `GAZE_DEBUG`) | deferred — logs are already frame-throttled (every 266–500 frames); low value vs multi-file touch | env var | console I/O cost on rig |
| 3 | Dwell pause-on-gap in frontend | **DONE (Entry 2)** | flag `dwellPauseOnGap`, default off | mid-blink misclicks; corner resets |
| 4 | Corner: progress retention on lock-break | **DONE (Entry 3)** | flag `lockBreakProgressRetention`, default off | `interrupts.byKind.lock_break` per selection |
| 5 | Cursor render via `transform`/direct-DOM instead of state-driven `left/top` | pending — needs on-rig render measurement first (freeze telemetry from Entry 4 supplies it) | FE flag, default off | `freezes.byKind.raf_stall` profile |
| 6 | Filter consolidation experiment (backend-only stability vs FE smoothing) | pending — needs on-rig baseline + corner edge-zone study | new preset, A/B vs `balanced` | telemetry residual + corner RMS |
| 7 | Corner edge-zone filter tuning (push corner RMS 5.9–12.6px toward center 0px) | pending — candidate params identified, must not break edge reachability tests | new backend preset | replay corner_* labels + on-rig corner test |

## Entry 6 — 2026-06-11 — FINAL: validated improvements become the defaults

After the on-rig A/B (results above), plain `.\start-dev.bat` now gets the improved behavior with no env vars or DevTools steps:
- **TTS async is default ON** (`main.py`): the env var is now an opt-out — `GAZECONNECT_TTS_ASYNC=0` reverts to the old synchronous path. Verified live: pipeline cadence uninterrupted through a real utterance, stale drops 1→0.
- **`dwellPauseOnGap` and `lockBreakProgressRetention` default ON** (`gazeFlags.ts`): A/B showed lock-breaks −28%/click, 2 rescued resumes, worst click residual 480px→109px, no felt regression ("overall keyboard experience was nice"). Median-residual delta (31→44px) attributed to confounds (DevTools-docked viewport, 2AM, drift) — to be re-checked in normal daytime use; if typing feels off, revert per below and report.
- **`set_gaze_offset` spam fix** (GazeCursor): offset now sent only when the value changes or the WS reconnects (was: many sends/second on every prediction update — observed in the 2026-06-11 session logs).
- A/B snapshots preserved in `docs/baselines/session-{A,B}-*.json`.
- **Browser cursor (YouTube / quick search):** no code changes — deliberately. Its dwell only advances on frame arrival (can't click during gaps), it emits `trackingLost` at >100ms gaps, and its v17.15/v17.16 Bayesian constants are telemetry-calibrated and spec-protected. It gains the biggest win automatically: backend stalls (which froze it equally) are gone with async TTS.

## Entry 7 — 2026-06-11 — Browser cursor: dwell progress retention (config, default ON)

**Symptom:** on YouTube/web pages, a tremor excursion mid-dwell reset the in-page dwell to 0 even though the ring stayed visually lit (v17.6 grace kept the CSS class, not the timer). The app cursor has had save-and-resume since v10; the browser cursor had nothing.
**Change:** `browserGazeController.ts` — on stability break, progress ≥5% is saved per `targetKey`; re-acquiring the SAME target within `gcConfig.progressRetentionMs` (1000ms) resumes from the saved fraction, skipping onset. Save invalidated by click commit, different-target dwell start, TTL, gcHide/gcResetDwell/gcBlockDwell. Resumes emit `dwellResumed` to the `events2` ring.
**Rollback:** `window.gcConfig.progressRetentionEnabled = false` (BrowserView DevTools).

## Entry 8 — 2026-06-11 — Browser cursor: gap pause (config, default ON)

**Symptom:** the in-page dwell timer is wall-clock (`now - state.start`); a blink/look-away mid-dwell counted toward the dwell — the browser-side twin of the app-cursor mid-blink misfire (A/B: 480px outlier → 109px after the app fix).
**Change:** `gcUpdateAndPoll` wrapper — frame gaps > `gcConfig.gapPauseMs` (150ms, matches app stale threshold + backend TTLs) shift `state.start`/`savedProgressAt`/`dwellingExpiryAt` forward by the gap: progress freezes, never advances or resets.
**Rollback:** `window.gcConfig.gapPauseEnabled = false`.

## Entry 9 — 2026-06-11 — Browser forwarding: per-frame (66Hz) instead of 30Hz poll

**Symptom:** renderer forwarded gaze to the BrowserView via a 33ms `setInterval` — up to 33ms added lag, ~half the tracker frames dropped, last-held position re-sent through blinks (page dwell advanced on stale gaze), hide-IPC re-sent every 33ms in watch mode.
**Change:** `WebBrowsingScreen.tsx` — forwarding now fires per WS gaze frame; a mousemove path keeps simulation mode working (no WS frames exist without the tracker); 14ms min-interval guard bounds IPC ≈70Hz; hide sent once per transition. Filter behavior (snap >18px, jitter gate <1.5px, EMA alphas) byte-identical.
**Rollback:** `git revert` (transparent transport change; no behavioral constants touched).

## Entry 10 — 2026-06-11 — Browser cursor: WMA(3) prefilter

`WebBrowsingScreen.tsx` — the same 0.45/0.30/0.25 three-sample pre-smoothing the app cursor applies before its EMA, now applied to the page-cursor input. Causal, ~zero added lag at 66Hz. Resets on hide/session reopen. Rollback: `git revert`.

## Entry 11 — 2026-06-11 — Render-load fixes (app + web screen)

- `GazeCursor.tsx`: cursor position moved off React state onto direct DOM `translate3d` writes — `setX/setY` used to schedule a full component reconciliation per gaze frame (66Hz). React renders re-derive the identical transform from `posRef`, so the writers can't disagree. Visuals unchanged. Measure on-rig via `freezes.byKind.raf_stall`.
- `WebBrowsingScreen.tsx`: removed the `gp` useState — written every gaze frame + every mousemove, never read anywhere, re-rendered the entire ~3800-line component at 66Hz.

## Entry 12 — 2026-06-11 — Double-speak fixed

`App.tsx handleSpeak` fired BOTH browser `speechSynthesis` AND backend pyttsx3 when connected (two overlapping voices on every SPEAK). Backend is now the sole voice when connected; browser synthesis remains the offline fallback. Rollback: `git revert`.

**New tooling:** `scripts/check-injected-script.js` — `new Function()` parse check for the injected browser script (a template literal tsc cannot validate). Run after any `browserGazeController.ts` edit.

---

## Entry 13 — 2026-06-11 — Adversarial review of Entries 7–12 (7 reviewers, per-finding verification)

A multi-agent adversarial review of the Entry 7–12 range raised 18 findings; every verification vote that completed confirmed its finding. **All confirmed findings are fixed in Entries 14–16.** Highlights of what was confirmed:
- **Critical:** the double-speak fix silenced Hindi while connected (backend SAPI5 renders Devanagari as a 46-byte silent WAV — empirically reproduced twice), including the Hindi half of the emergency phrase.
- **Critical:** simulation mode (and the automatic mouse fallback after a 1.5s tracker dropout) could no longer dwell-click in the embedded browser — a stationary mouse fires no events and the gap pause neutralized wall-clock catch-up.
- **Major:** gap-pause could shift `state.start` past the wall clock (dwell silently dead up to ~2s after click+blink); retention saved off-target wall-clock overrun as 0.99 (glance-back commits faster than human reaction); the sticky-ghost could resume onto stale coordinates after a YouTube re-flow; Voice Settings were dead on the backend path; backend-TTS-dead = total mute behind a green "Connected".
- **Minor (all fixed):** WMA blended seconds-old samples after gaps; WMA lag raised the effective snap gate 18→~40px; retention keys broke on resolution-path kind flips; gcConfig rollbacks evaporated on page load; the hide-once guard could strand a frozen page cursor after an effect re-run.
- **Noted, not actioned:** 66Hz forwarding doubles page-side DOM scan cost (bounded by the 80-card slice) — to be measured on-rig via the page frames ring (`dtMs`) before any throttling decision.

## Entry 14 — 2026-06-11 — Speech safety: Hindi routing, TTS-health fallback, settings sync

`src/utils/ttsRouting.ts` (pure, tested) + `App.tsx` + `useWebSocket.tsx` + `main.py`:
- **One voice per utterance, routed safely:** volume 0 → mute everything and stop in-flight speech (deliberate: this also mutes emergency speech, honoring the panel's "0 = muted"); Hindi/Devanagari → browser speechSynthesis with mixed text split into per-script runs (en-US then hi-IN) so the bilingual emergency phrase is audible in both languages; English → backend only when connected AND `tts_available`, else browser fallback.
- **TTS health handshake:** `TTSEngine.available` → `tts_available` in the `connected` message → `ws.ttsAvailable`. A connected-but-voiceless backend now falls back to the browser voice instead of leaving the patient mute.
- **Reconnect overlap:** backend path cancels in-flight browser utterances; `ws.stopSpeaking` cancels BOTH engines.
- **Settings wired:** ttsRate (WPM) / ttsVolume sync to the backend on connect/change; the browser fallback converts WPM → utterance multiplier (was passing raw WPM = max speed).
- **Tests:** `node scripts/check-tts-routing.js` (17 checks) + `python\tests\test_tts_available.py` (5 cases).
- **Known residual:** a mid-session engine wedge (runAndWait hang) is not detectable via the handshake flag; the cross-thread `engine.stop()` remains the most likely wedge trigger (pre-existing).

## Entry 15 — 2026-06-11 — Browser dwell hardening (retention + gap pause)

`browserGazeController.ts`: progress saves count only genuinely on-target time (`lastOnTargetAt`); overrun is discarded, not clamped; resume requires a fresh real hit-test resolution (never the sticky ghost) with a kind-normalized key match; navigation invalidates saves; gap-pause shifts only clocks that predate the gap and never past the wall clock (`dwellingExpiryAt` capped at one fresh 600ms grace window).

## Entry 16 — 2026-06-11 — Forwarding correctness + durable browser-flag rollback

`WebBrowsingScreen.tsx`: 33ms heartbeat ONLY when no real gaze stream exists (restores simulation park-to-click without reintroducing stale-gaze dwell advancement); page-cursor visibility tracked in a ref that survives effect re-runs (kills the stranded frozen cursor); WMA resets after >150ms stream gaps and real↔simulation flips; the 18px snap gate tests unfiltered displacement and restarts the WMA at the new point.

`main.ts` + `gazeFlags.ts`: `progressRetentionEnabled/Ms` + `gapPauseEnabled/Ms` are now part of `browserGazeConfig` (type, defaults, setGazeConfig whitelist, per-page seed) and driven by two new localStorage gazeFlags — `browserProgressRetention`, `browserGapPause` (default ON). A rollback set once now survives page loads AND restarts.

## Rollback instructions (current state)

Each improvement reverts independently, without code edits:
- Speech back to old (blocking) behavior: set `GAZECONNECT_TTS_ASYNC=0` before `start-dev.bat`.
- Dwell behaviors back to old: in DevTools console — `window.__gazeFlags.set('dwellPauseOnGap', false)` and/or `window.__gazeFlags.set('lockBreakProgressRetention', false)` (persists across restarts).
- Browser-cursor behaviors back to old (persistent, survives page loads and restarts): in the MAIN app DevTools — `window.__gazeFlags.set('browserProgressRetention', false)` (Entry 7) and/or `window.__gazeFlags.set('browserGapPause', false)` (Entry 8), then re-enter the web screen. Per-page-only override still works via `window.gcConfig.*` in the BrowserView DevTools.
- Speech routing back to old behavior: `git revert` the Entry 14 commit (the old behavior — two overlapping voices — is itself the bug, so no runtime flag is provided).
- Telemetry additions are measurement-only (no behavior); removal = `git revert`.
- Transport/render changes (Entries 9–12) have no behavioral constants; revert their individual commits if needed.
- Hard rollback of everything: `git checkout de1aee6` (or revert the commits on top of it).
