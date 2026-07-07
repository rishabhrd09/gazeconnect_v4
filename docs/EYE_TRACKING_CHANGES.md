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

## Entry 17 — 2026-06-11 — Browser cursor: per-frame focus churn removed (config, default ON)

**Symptom:** `clickRequestFor` called `target.focus()` on EVERY resolved frame (~33Hz) — focus flipped between elements as gaze moved over a page: visible focus-ring flicker on links/buttons, search boxes popping suggestion dropdowns from a mere glance, and keyboard focus stolen from the field the patient was typing in. A direct flicker/instability source on ordinary (non-YouTube) pages.
**Change:** `browserGazeController.ts` — focus now happens once, at click-commit time (right before the trusted click; the trusted mouseDown focuses natively anyway, so this only covers exotic widgets).
**Rollback:** `window.gcConfig.focusOnResolve = true` (also a `browserGazeConfig` key — persists via setGazeConfig/per-page seed).

## Entry 18 — 2026-06-11 — Browser cursor: per-frame scan diet (transparent perf change)

**Symptom:** the YouTube resolution ladder (skip-ad sweep = 3 document-wide `querySelectorAll` passes incl. case-insensitive attribute matchers; Bayesian card pool + nearest-card scan with per-card `getComputedStyle`) ran on every gaze frame on EVERY site. Off-YouTube the selectors are a guaranteed no-match — pure page-main-thread waste (~33Hz) on the most common browsing case (search/news/wiki), competing with the dwell loop itself.
**Change:** `browserGazeController.ts` — (a) the whole YouTube ladder is gated on `location.hostname` matching youtube.com/youtu.be (refreshed on route change); (b) on YouTube, the skip-button sweep result is cached: cached node revalidated every frame (stale/hidden drops instantly), full sweep at most every 300ms or after a hard DOM epoch. Worst case: a brand-new skip button becomes snap-eligible ≤300ms late (they persist for seconds).
**Rollback:** behavior-neutral by construction off-YouTube; `git revert` if anything YouTube-side feels different.

## Entry 19 — 2026-06-11 — Browser cursor: small-target probe snap (config, default ON)

**Symptom:** outside YouTube there was no acquisition aid at all — the page resolved only what was directly under the gaze point, and links/buttons/video controls on dense pages are far smaller than the ALS gaze noise floor (median click residual 31–44px on-rig vs ~20px link heights). Small targets needed pixel-perfect fixation; misses resolved nothing and dwell never started.
**Change:** `browserGazeController.ts` `probeSnapTarget` — when a frame resolves nothing interactive, hit-test a ring of offsets (8 directions × 2 radii, ≤16 `elementFromPoint` calls, no document scans) and snap to the nearest interactive element whose rect is within `probeSnapRadiusPx` (36px default) of the gaze point. Runs last in the ladder, so it can never override a direct hit. Clicks land at the element center (`probe_snap` kind in telemetry).
**Rollback:** `window.gcConfig.probeSnapEnabled = false`; radius tunable via `probeSnapRadiusPx` (8–80).

## Entry 20 — 2026-06-11 — Browser cursor: dwell progress arc + inter-frame smoothing (config, default ON)

- **Progress arc:** the in-page ring was binary (yellow = dwelling) — the patient couldn't tell a 20% dwell from a 90% one and tended to anxiously re-fixate; the app cursor has always shown progress. A conic-gradient arc (`--gc-frac`, driven per frame) now sweeps 0→360° across the dwell. Rollback: `window.gcConfig.progressArcEnabled = false`.
- **Smoothing:** the ET5 delivers ~33Hz, so the cursor stepped ~30ms apart (visibly choppier than OptiKey's display-rate cursor). A 60ms linear `left/top` CSS transition lets the compositor interpolate between frames (~1 frame of visual lag, position math untouched — purely visual). Re-shows after a hide commit transition-free so the cursor never "sweeps in" from a stale position. Rollback: `window.gcConfig.cursorSmoothingMs = 0`.

## Entry 21 — 2026-06-11 — Browser cursor: body-safe injection (page-load cursor gap closed)

**Symptom:** "cursor freezes during page load." Injection runs at navigation commit (`did-navigate`) — but the script did `document.body.appendChild` and `mo.observe(document.body)`, and `<body>` often doesn't exist yet at commit. The whole injection IIFE threw, leaving the page with NO cursor and NO dwell from commit until the `dom-ready` re-injection — seconds on heavy pages. The MutationObserver registration failing also meant pages injected early ran with no DOM-epoch detection.
**Change:** `browserGazeController.ts` — cursor attaches to `document.body || document.documentElement` (position:fixed renders identically under `<html>`); observer watches the same fallback root (covers the body subtree once the parser creates it).
**Rollback:** `git revert` (pure crash fix; no behavioral constants).

## Entry 22 — 2026-06-11 — Edge scroll: smoother cadence, same speed (config)

**Symptom:** armed edge-scroll moved in 18–36px jumps every 120ms (~8Hz) — visibly chunky for reading.
**Change:** `main.ts` defaults — 9–18px at a 45ms throttle (~every other 33Hz gaze frame): same ~150–300 px/s, ~2.5× finer steps. Clamp floors widened (deltas 4/8px, throttle 30ms) so tuning down stays possible.
**Rollback (runtime):** `setGazeConfig({ edgeMinDeltaPx: 18, edgeMaxDeltaPx: 36, edgeThrottleMs: 120 })`.

## Entry 23 — 2026-06-11 — Transport + observability (transparent)

- `webview:updateGaze` is now a one-way `ipcRenderer.send` (was `invoke`) — the handler returns nothing, so the per-frame reply message was pure main-process overhead. The `ipcMain.handle` registration is kept for compatibility. Rollback: `git revert`.
- Dwell clicks now log unconditionally (1s-throttled) via `browserDiagnostics.info` — the 2026-06-11 on-rig captures contained ZERO browser-path lines because everything routed through the `DEBUG_BROWSER_GAZE`-gated `debug()`, making click behavior unverifiable after the fact. Full diagnostics still require `DEBUG_BROWSER_GAZE=1`.

## Entry 24 — 2026-06-11 — Backend: push-on-frame gaze broadcast (env, default ON)

**Symptom:** session-log analysis confirmed the ET5 delivers ~33Hz (broadcast ceiling 33 msgs/s in every capture) while the broadcast loop ticks at 66Hz and only sends on ticks — each frame waited 0–15.2ms (mean ~7.6ms) for the next tick. Avoidable glass-to-glass latency on every frame, app-wide (keyboard AND browser).
**Change:** `python/main.py` — the gaze path sets an `asyncio.Event` the moment a frame is stored; the broadcast loop waits on it (50ms timeout keeps rate-logging/dead-client sweeps alive through gaps) and sends immediately. The paced loop remains intact behind the flag. Startup line now reports the actual mode instead of the misleading "~66Hz".
**Measured:** offline replay byte-identical to baseline (tremor 9.636px/94.36%, pursuit 57.569px/71.8%); pipeline 9/9, edge stability 4/4, TTS 5/5 pass. Latency delta needs on-rig confirmation (expect `Gaze broadcast` rate unchanged at ~33 msgs/s, but frame-to-send delay ≈0).
**Rollback:** `GAZECONNECT_GAZE_PUSH=0` before starting the backend.

## Entry 25 — 2026-06-11 — Sidebar card drift fixes (on-rig feedback, config, default ON)

**Symptom (patient/developer on-rig, watch page):** "cursor keeps drifting when I try to stop it on a sidebar suggested video; very difficult to control." Three mechanisms found:
1. The Bayesian winner was a pure per-frame argmax — on the sidebar's vertically-stacked compact cards (~120px apart) gaze noise keeps two posteriors near-equal, so the winner flipped A→B→A; every flip restarted the dwell and yanked the cursor's visual anchor to the other card's center. The flip ping-pong IS the perceived drift.
2. With Scroll armed, edge-zone auto-scroll engaged 650ms into a dwell on any card in the top/bottom 20% bands — the page scrolled mid-dwell, the card moved under the gaze, onset-cancel fired, and the cursor appeared to slide off the target.
3. Renderer-side fixation follow was twitchy (1.5px jitter hold, 0.74 follow alpha).

**Changes:**
- `browserGazeController.ts` — **incumbent stickiness**: while a card is the tracked dwell target, a challenger must beat its posterior by `bayesianStickyMult` (1.35×) to take the win; argmax otherwise unchanged. Stable-winner gate constants are now tunable (`bayesianStableFrames`=4, `bayesianStableMargin`=0.10) for on-rig tuning via setGazeConfig.
- Poll envelope: the per-frame script now returns `{c: click|null, s: dwellState}`; `main.ts` caches `s` and **pauses edge scrolling while dwellState ∈ {onset, dwell, commit}** (`edgeScrollPauseDuringDwell`, default ON; the 650ms edge hold restarts after the dwell ends).
- `WebBrowsingScreen.tsx` — jitter hold 1.5→2.5px; sub-8px follow alpha 0.74→0.65. Refixations unaffected (>18px snap gate is upstream, unfiltered).

**Measure on-rig:** in the BrowserView DevTools, `__gcTelemetry.events2().filter(e => e.kind === 'targetSwitch').length` per minute of sidebar browsing should drop sharply; `snapshot().medianResidualPx` and dwellToClickMs on `youtube_nearest_card` clicks should improve.
**Rollback (runtime):** `setGazeConfig({ bayesianStickyMult: 1, edgeScrollPauseDuringDwell: false })`; renderer constants via `git revert`.

## Entry 26 — 2026-06-11 — ROOT CAUSE: page-zoom coordinate mismatch (config, default ON)

**Symptom (on-rig, second report):** cursor "drifts toward the right" when trying to select sidebar videos; screenshot showed the ring at the far right edge (~x1600) while the user was looking at the cards (~x1170). 1600 ≈ 1170 × 1.35 — the page zoom factor.

**Root cause:** the BrowserView runs at `setZoomFactor(1.35)` (AAC readability default), and NOTHING in the gaze path converted coordinate spaces. The injected script received view DIPs but the page operates in CSS px (= view/zoom):
- The ring was drawn at `gaze × 1.35` physically — a rightward+downward drift growing with distance from the top-left. At the watch-page sidebar it was hundreds of px; the patient had to look UP-LEFT of a card to bring the ring onto it.
- `elementFromPoint(gaze-as-CSS)` hit whatever was visually at 1.35× — and for gaze x beyond `innerWidth` (the right ~26% of the view!) it returned null: nothing was ever resolvable there.
- Every radius/distance compared mixed units (gaze in view px vs rects in CSS px) — why card snap zones had to be tuned so wide.
- Trusted clicks: `sendInputEvent` DIPs are divided by zoom in Blink, so a click aimed at an element's CSS center landed at center/1.35 — 26% up-left, on big grids often inside the NEIGHBOURING card: the long-reported "plays the wrong thing" mis-click.

**Change:** `main.ts` — gaze is divided by `webContents.getZoomFactor()` before the per-frame poll (hit-testing, dwell, and the ring now live in true CSS space, so the ring renders exactly where the patient looks), and `sendTrustedBrowserClick` multiplies page-CSS click coords back into view DIPs (clicks land on the element center). Edge-scroll wheel events and `webview:click` were already in input space — untouched.
**Consequences:** all in-page radii (stability 60, card zones 130/230) now measure true CSS px while gaze noise in CSS is old-noise/1.35 — effectively ~35% MORE forgiving. If snapping now feels too grabby, the zones can be tuned DOWN via setGazeConfig (a good problem).
**Rollback:** `setGazeConfig({ zoomCompensationEnabled: false })` restores the old (broken) spaces exactly.

## Entry 27 — 2026-06-11 — Zoom-aware radius scaling (config, default ON) — closes the Entry-26 grabbiness shift

**Why:** the Entry-26 coordinate fix made the gaze the injected script receives correct (page CSS px = view px / zoom). But the snap/hold/probe radii and the Bayesian sigma were tuned as ON-SCREEN (view-px) footprints, so at the 1.35 default zoom every zone silently spanned ~35% more screen than intended — and on the dense YouTube sidebar the 130px card-snap halo blanketed neighbouring cards' centres, an ambiguity/drift source on the exact screen the patient struggles with. (Found by the Entry 17-26 adversarial verification, comfort skeptic, rated MAJOR.)

**Change:** `browserGazeController.ts` — a `radiusScale()` helper divides every in-page PIXEL DISTANCE by the live page zoom (pushed in per frame as the 4th arg to `gcUpdateAndPoll`, the same zoom factor used to divide the gaze): the four card/skip snap+unsnap accessors, `stabilityRadiusPx`, `youtubeCardStabilityRadiusPx`, `youtubeCardUnsnapPx`, `youtubeSkipSnapPx`, `youtubeSkipUnsnapPx`, `targetRegionSlackPx`, `probeSnapRadiusPx`, `bayesianSigmaPx`, and the 80px sticky tolerance. Time constants (dwell/onset/cooldown) and the renderer-side >18px view-px snap gate are NOT scaled. `main.ts` passes `zf` into `buildGazeUpdateAndPollScript`.

**Why it's safe (provable):** gaze, rect coordinates, every radius, sigma, and slack are now all CSS px divided by the same factor, so each distance comparison (`distanceToRect` vs radius; `hypot(gaze−centre)` vs sigma) scales identically on both sides — the dwell and Bayesian outcomes are mathematically identical to the zoom=1 case. The net effect is purely a corrected on-screen footprint, no posterior-dynamics change. Independently re-verified (6/6 checks pass, no scaled-vs-unscaled mismatch, no double-scale, no time constant scaled). Also fixes the latent per-domain-zoom case (adjustZoom remembers 0.75–2.5× per domain) where the un-scaled error would have been far larger than 1.35.
**Consequence:** the config numbers now mean "on-screen px at 100% zoom" — the intuitive unit for on-rig tuning. If the sidebar still feels too grabby or too tight after this, trim/raise `youtubeCardHitZonePx` (snap-IN) via setGazeConfig and the change is now in stable screen-px units.
**Rollback:** `setGazeConfig({ zoomScaleRadii: false })` (or `window.gcConfig.zoomScaleRadii = false`) → `radiusScale()` returns 1 everywhere → exact pre-change footprints. Survives page load (in both seed lists).

## Entry 28 — 2026-07-05 — Offline replay harness + empty-dwell guard + scan diet v2

**New tooling: `node scripts/browser-cursor-replay.js`** — the injected browser cursor finally has an offline behavioral rig (the app cursor has had `gaze_trace_replay.py` since Entry 0; the injected script only had a parse check). It compiles the REAL `browserGazeController.ts`, boots the REAL injection IIFE in a Node VM against a synthetic DOM with a mocked clock, and drives the REAL per-frame poll contract (view-px → CSS divide, `pageZoom` arg, envelope JSON) through 12 scenarios: grid fixation, blink-gap pause + flag rollback, progress retention (same-target / cross-target / route-change / flag-off), sidebar ambiguity + stickiness, zoom invariance (0.75/1.0/1.35/2.0), stationary simulation, playing-video suppression + skip-ad exemption, probe-snap radius, empty-space instant-click, empty-space dwellState, hot-path cost counters, ring bounds over 4500 frames. Run it after ANY `browserGazeController.ts` edit, alongside `check-injected-script.js`. Exit 1 on any invariant failure.

**Bug found by the harness (S11/S12), fixed — empty-dwell guard (config, default ON):**
Gaze parked on NON-interactive page space still ran the dwell clock (`state.start` was set unconditionally at acquisition):
1. After ~1.1s parked, the first interactive element the gaze drifted onto WITHIN the 60px stability radius was clicked **instantly with zero dwell time** on it (reproduced: `instant click [["interactive",0]]`) — a misclick generator on dense pages (park in a paragraph, drift onto an adjacent link).
2. `dwellState` read onset→dwell→commit and STUCK at `commit`, so `edgeScrollPauseDuringDwell` paused armed edge-scrolling indefinitely while the patient read blank/text areas — "scroll feels dead".
3. The dwelling ring + progress arc lit up and filled over empty space — false affordance.

Fix (`browserGazeController.ts`): (a) no resolved target ⇒ dwell clock stays 0; (b) the resolved element's IDENTITY changing mid-stability forces re-acquisition (identity = stableKey minus the kind prefix and rect-quantization tail, so `youtube_anchor`↔`youtube_card` flips and small reflows still do NOT restart — same tolerance as the retention key); (c) commit requires identity match between the committing element and the tracked target; (d) `dwellState`/ring/arc require a tracked target.
**Rollback:** `setGazeConfig({ emptyDwellGuardEnabled: false })` (persists; also per-page `window.gcConfig.emptyDwellGuardEnabled = false`).

**Scan diet v2 (transparent perf, harness-verified outcome-identical):**
- **Card-scan cache** — `bayesianYoutubeCard` and `nearestYoutubeCard` each ran `document.querySelectorAll(cards)` + a per-card anchor `querySelector` EVERY frame (and when gaze was away from all cards BOTH ran — bayesian finds an empty pool, falls through to nearest). Card-set membership only changes via DOM mutations, which already bump the candidate epoch, so the `{card, anchor}` node list is now cached per epoch with a TTL backstop (`cardScanCacheMs`, default 250ms, same staleness bound as the Entry-18 skip cache) and per-use `isConnected` revalidation. Rects/visibility still evaluated fresh per frame. **Rollback:** `setGazeConfig({ cardScanCacheMs: 0 })` = legacy scan-every-frame.
- **Rect-first pre-filter** — per-card `getComputedStyle` visibility checks now run only for cards whose FULL rect is within the widest qualifying radius (exact exclusion: snapRect ⊆ fullRect ⇒ dist(snapRect) ≥ dist(fullRect)). Flagless — provably identical outcomes.
- **Read-before-write reorder** — the per-frame cursor `style.left/top` write happened BEFORE `resolveClickRequest`'s `elementFromPoint`/rect reads, forcing a synchronous re-layout every frame; hit-testing now runs first on clean layout, writes after (every early-return path writes its own cursor position — visible behavior unchanged).
- Harness counters (30-card sidebar, gaze off-cards): getComputedStyle **122 → 2.0**/frame, subtree querySelector **180 → 3.2**/frame, getBoundingClientRect **362 → 62**/frame, document querySelectorAll **2.2 → 0.3**/frame. Zoom-invariance commits at the identical frame before/after.

**Telemetry:** frames ring gains `rMs` (resolveClickRequest duration) + `nCand` (Bayesian pool size); new `__gcTelemetry.perf()` returns dt p50/p95/max, resolve p50/p95/max, pool size, approx incoming Hz, and ring occupancy — computed on demand only. Covers the previously-unmeasurable "DOM scan duration / candidate count / frame cadence" acceptance metrics.

**App cursor (`GazeCursor.tsx`):** the Phase-A anchor called `setHighlightRect` with a FRESH object on every gaze frame while dwelling — a per-frame React re-render for identical values. Now value-gated (returns the previous object when unchanged → React bails out); a real mid-dwell layout shift still updates immediately. `git revert` to undo.

**Deliberately NOT done: 1€ filter.** The renderer chain (WMA(3) → unfiltered 18px snap gate → distance-adaptive EWMA → 60ms CSS interpolation) was tuned on-rig with patient feedback (Entries 20/25). Replacing it without rig measurement is unmeasurable churn; the replay harness now provides the offline A/B infrastructure to evaluate a 1€ stage properly later.

## Entry 29 — 2026-07-06 — OptiKey-audit pass: toggle/home calm prototypes, progress bank, links v2, latency telemetry

Driven by the three-agent code audit vs OptiKey 3.2.5 (plan: toggle-magnetism stack, home-screen snap aggressiveness, dense-page single-slot starvation, links-sidebar data quality, unmeasurable e2e latency). Tier A ships ON; every Tier B behavior change defaults OFF pending its on-rig A/B protocol.

**Tier A (active now):**
- **A5 — end-to-end latency telemetry (measurement-only):** gaze payload gains `t_helper_ms` + `t_sent_wall_ms` (same-machine Unix-ms stamps); GazeCursor records `{ingest, pipeline, ws, e2e, paint(sampled ~1/8)}` into a 500-slot ring; `window.__gazeTelemetry.snapshot().latency` reports p50/p95/max, `.latency()` the raw ring. Gap-hold rebroadcasts are deduped by helper stamp. Expected baseline: e2e p50 40–70ms, p95 <100ms.
- **A1 — links-sidebar extraction v2 (`linksExtractionV2`, default ON):** labels via `innerText` → aria-label → title → img[alt] (kills the raw-CSS labels from `<style>`-inside-anchor), computed visibility + viewport checks, `javascript:`/same-page-fragment hrefs dropped, up to 120 candidates ranked (in-viewport ×2 + area + reading order) before dedupe (href AND label) and the 15 cap, plus a 1.5s post-load re-extract for SPA hydration. Rollback: `setGazeConfig({ linksExtractionV2: false })` = byte-identical v1 script.
- **A2:** quick-search read-mode "Pause/Play" (sends the YouTube `'k'` hotkey) now renders only on YouTube URLs — it typed a literal "k" into Google/News pages.
- **A3:** dwell-table truth unified — CLAUDE.md's fictional "400ms emergency" corrected to the shipped 2000ms; `design.ts dwellTiming` marked as the deprecated GazeButton-only fallback; dwellTimeConfig.ts declared authoritative.
- **A4:** sub-80px gaze targets raised — compass CLOSE (≤68→80px floor), YES-REMOVE/CANCEL confirms (≤64→80), floor-transition trio (60→80); advanced-map SAVE/REFINE 60→`clamp(64px,9vh,84px)` (clamped, not fixed, so the fixed-height sidebar cannot overflow at 768p). GlobalNavBar compact floor (60px) deliberately NOT raised — needs a 1366×768 keyboard-key-height check first (nav is global; keys are flex-sized).

**Tier B (flag-gated, default OFF — see plan for per-item A/B protocols):**
- **B5 — gap-hold stale marking (`GAZECONNECT_GAP_HOLD_MARK=1`, default off):** the >150ms-gap rebroadcast used to re-send the previous payload VERBATIM — `signal_state:'valid'` included — defeating `dwellPauseOnGap` (a fresh WS message with a 'valid' state passes both its checks). Flag on: the held frame is a copy marked `signal_state:'gap_hold'` (is_valid untouched — cursor visible, dwell paused). Verified by `python\tests\test_gap_hold_mark.py` (3 tests incl. end-to-end blink-gap rebroadcast through `_on_gaze_data`).
- **B1-FE — toggle calm, frontend (`window.__gazeFlags.set('toggleCalmFrontend', true)`):** snap 220px/0.36 → 150px/0.28, priority score bonus capped +0.6→+0.3, gaze-ON assist 0.12/112 → 0.08/90. The gaze-OFF assist (0.18/140) is untouched — bootstrap recovery path. Sequencing note (load-bearing): frontend FIRST — backend magnetism >0.8px/frame currently suppresses these layers near the toggle, so a backend-first cut would just un-suppress the untouched 220px field (confounded A/B).
- **B1-BE — `set_magnet_params` WS message:** live per-context magnetism tuning ({context, radius 20–300, pull 0.05–0.60, release (floored to radius), capture_full}) with shipped defaults as class constants (`MAGNET_CONTEXT_DEFAULTS`) — restart restores them. The audited gazetoggle privileges (165px radius, full-radius capture vs 0.82× for everyone else, release 185) are now one message away from an on-rig experiment: `{"type":"set_magnet_params","context":"gazetoggle","radius":90,"pull":0.22,"release":110,"capture_full":false}`. 6 tests in `python\tests\test_magnet_params.py` (clamps, only-named-context, escape floor).
- **B2 — home snap calm (`homeSnapCalm`):** `homescreentile` branch in getSnapConfig — radius 140→120, strength 0.30→0.22, ×1.45 near-center boost OFF (the exact keyboard/prediction precedent for the same "over-responsive" complaint). Ship only with/after B1-FE (snap scoring is relative — calming tiles under an uncalmed toggle worsens the toggle capture).
- **B3 — per-target progress bank (`browserProgressBank` → gcConfig `progressBankEnabled`):** replaces the browser cursor's single save slot with an identity-keyed bank (cap 8 LRU, per-entry TTL = progressRetentionMs), so dense-page ping-pong between adjacent links accumulates EACH link's progress instead of discarding the other's on every flip. All existing invalidations preserved (commit/route/hide/reset/block clear the whole bank; on-target-time-only accounting; sticky-ghost banned from resume). **Replay-proven** (scenario S13): flag OFF = starvation (0 clicks in 6.7s of 24px-pitch alternation — the audited dominant quick-search failure), flag ON = majority link commits, minority NEVER, via banked resumes; all 12 prior scenarios unchanged.
- **B4 — probe-snap incumbent hysteresis (`probeSnapHysteresisPx`, default 0 = legacy strict-nearest):** a challenger must beat the ≤250ms-recent probe winner by the margin (screen px, zoom-scaled) to displace it. Test at 6px only if B3 leaves targetSwitch/min high — both attack the same metric.

**Rollbacks:** A5/A2/A3/A4 `git revert` (measurement/UI/docs/layout only). A1 `setGazeConfig({ linksExtractionV2: false })`. B5 unset `GAZECONNECT_GAP_HOLD_MARK`. B1-FE/B2/B3 `window.__gazeFlags.set('<flag>', false)` (persists). B1-BE restart, or re-send shipped values. B4 `setGazeConfig({ probeSnapHysteresisPx: 0 })`.

**Follow-ups (same day):**
- **B1-FE scope extension — capture sequence (video + log correlated, 17:23 session).** The patient clarified: the problem is not the approach pull but what happens once gaze gets NEAR the toggle — candidate acquisition from ~90-129px out, the 100ms always-active onset, then the v16 teleport-to-centre + per-frame hard anchor ("magnetically takes the cursor to the centre"), followed by the app's fastest-feeling dwell. The log confirmed the yank persisted AFTER the backend magnet calm was applied mid-session (17:25:38), isolating it to these frontend mechanisms, which the original B1-FE did not touch. Under the SAME `toggleCalmFrontend` flag, with gaze ON only: standard 250ms onset (was 100), no teleport (gradual 25%/frame settle via the anchor), no ±64px extended hit points, no +30px nearest-centre margin, dwell 1150→1450ms. Gaze-OFF bootstrap (100ms/850ms/full reach/strong assist) and Emergency are untouched in all states.
- **Log-reading note for 1365px-wide test windows:** `[OPTIKEY] raw=… stable=…` diverge by ×(1920/window-width) because raw/kalman are SCREEN-normalized and stable is WINDOW-normalized — e.g. raw x 0.59 → stable x 0.83 at inner=1365 is the correct mapping, not rightward drift.
- **DevTools WS tuning hook** — `window.__gazeWs.send(type, data)` in useWebSocket: the set_magnet_params handler was unreachable from a live session without it (found while answering "is it actually fixed"). Debug/tuning surface only.
- **BrowserView listener-cap fix** — Electron stacks temporary internal 'did-stop-loading' listeners per pending navigation/execute; our 33Hz polls around click/back bursts tripped Node's default warn threshold of 10 (on-rig logs showed the count DRAINING afterwards — transient, not a leak). `setMaxListeners(30)` (finite, real leaks still warn) + the 60s browser-memory diagnostics line now samples `stopLoadListeners=N` as evidence.
- **Poll gate — the REAL fix for the listener pile-up (18:23 on-rig log: count hit 31, past the raised cap).** Root cause confirmed: between a cross-document navigation start and dom-ready, Electron PARKS every executeJavaScript — each parked call holds a did-stop-loading listener — so ~1s of loading queued ~31 gaze/playback polls, which then replayed as a burst of stale polls against the fresh page. New `_pageScriptReady` gate per BrowserView (false at creation and on main-frame cross-document did-start-navigation, true at dom-ready): `handleWebviewGazeFrame` and `sendBrowserPlaybackState` skip entirely while it's closed. Nothing is lost — the injected cursor script doesn't exist in that window anyway — and the post-load stale-poll burst is gone. Same-document (SPA) navigations keep the gate open. Verify on-rig: the MaxListeners warning should not appear and `stopLoadListeners` in the 60s diagnostics line should stay single-digit.
- **Activation status:** patient-facing behavior is UNCHANGED by default. The B1/B2 calm-downs activate for a test session via: `window.__gazeFlags.set('toggleCalmFrontend', true)`, `window.__gazeFlags.set('homeSnapCalm', true)`, and `window.__gazeWs.send('set_magnet_params', { context:'gazetoggle', radius:90, pull:0.22, release:110, capture_full:false })` (re-send after backend restart — flags persist, the WS message does not). Defaults flip only after the on-rig pass (gaze-OFF recovery 10/10 is the abort gate). Known NOT yet addressed: the backend free-zone→on_key speed surge on home (Tier C) — if home still feels rushy WITH homeSnapCalm on, that is the expected next suspect, not a failed fix.

## Entry 30 — 2026-07-06 — Keyboard/ZoneBoard/prediction pass: honest cadence, repeat guard, Hindi safety, typing telemetry

Driven by a three-agent audit of the keyboard, ZoneBoard, and prediction stacks (plan: best-possible gaze typing — accurate intended-key resolution, stable lock, stage-appropriate speed, English + Hindi, better suggestions). Tier A ships ON (measurement/safety/truth, no felt behavior change); every Tier B behavior change defaults OFF pending its on-rig A/B protocol. **Two audit claims were disproven by tracing the actual code and were NOT acted on** (see below) — the disciplined outcome.

**Tier A (active now):**
- **A2 — Hindi/Hinglish prediction guardrails:** `prediction_guardrails.py` gains Devanagari + Hinglish violence/self-harm/poison and mental-health-harmful entries (मरना/मर/आत्महत्या/जहर/बंदूक/बोझ… + marna/aatmahatya/zeher/bandook/bekaar…) plus multi-word phrases (मार डालो / maar dalo). Emotion words (उदास "sad", निराश "disappointed") are deliberately NOT blocked, matching the English policy of preserving the patient's ability to express feelings. Because all three prediction layers (n-gram, neural, sentence) already gate on `is_blocked_prediction_word`/`contains_blocked_prediction_word`, the bilingual patient's harm words are now blocked everywhere at generation time. `PatientBigramTracker.learn()` also rewritten to walk the raw token stream and bond only ADJACENT valid tokens — a blocked/invalid token now BREAKS the bigram chain instead of bridging its neighbours into a pair that never occurred. Verified: 0/22 mis-classifications on a block/allow suite; 11/11 prediction-pipeline tests green.
- **A1 — keyboard + prediction typing telemetry (measurement-only):** `gazeTelemetry` per-click event gains `action` (letter/backspace/deleteWord/…) and `nearestAlt` (the runner-up keyboard key's id + px distance to the gaze sample). `snapshot().keyboard` now reports `letterClicks`, `backspaceAfterSelect(+Rate)` (a backspace within 3s of a letter — the wrong-key proxy), `medianNearestAltDistPx` (ambiguity), and `perKeyConfusion` (which letters get corrected most). `predictionTelemetry` gains `acceptByRank` (top-1 vs top-4 value) and `perLangAccepts` (en/hi split) via an optional, backward-compatible accept-meta arg. This is the measurement that turns every Tier B/C decision from opinion into evidence — capture a baseline BEFORE flipping any default. Aggregation logic unit-tested (correction attribution + >3s-ignore).
- **A3 — truth fixes:** CLAUDE.md's Datamuse "5-layer pipeline / 300ms enrichment" claims removed (Datamuse is documented but does not exist in code — pipeline is 4-layer); guardrail count line made language-accurate. GazeCursor `_getEffectiveDwell` gains an explicit `'prediction'` context case initialized to `keyboardKey` — a verified no-op on the keyboard screen (predictions already fell through to keyboardKey), making suggestion timing independently tunable later.

**Tier B (flag-gated, default OFF — OFF state is byte-identical to today, proven by construction + logic tests):**
- **B1 — `keyboardCadence` (stage-specific keyboard speed, the core ask):** for keyboard/prediction targets ONLY, GazeCursor reads the honest per-stage onset from `KEYBOARD_CADENCE_BY_STAGE`, uses the stage's tuned letter dwell, and replaces the hidden `+1000ms` cooldown floor with the stage's configurable cooldown base (keyboard-after-keyboard clicks only — nav/home/emergency and the first click after leaving the keyboard keep the +1000 floor). Real per-key totals drop at every stage: caregiver ~2315→~1450ms, early ~2650→~1950, **mid ~3155→~2450 (−22%)**, late ~3830→~3200 (−16%). The compression comes mostly from the cooldown (where the dead time hides), not from cutting dwell — Late's dwell barely moves (1980→1850) because late-stage accuracy is paramount. The prior real onset was a hardcoded 250ms at ALL stages (the Settings onset slider was DEAD on the real path); this makes it honest without ever silently slowing the patient (OFF = today exactly).
- **B2 — `repeatGuard` (continuity guard on fast-repeat):** the repeat accelerator ([0,250,350]) was same-key gated but had no continuity requirement — leave a letter entirely and return within 2s and it still fired a 250ms fast repeat (an accidental double-letter, not a wrong key). Now a fast repeat is suppressed if the gaze acquired a DIFFERENT onset target since the last click on this key (a look-away-and-return); a deliberate immediate repeat still accelerates. Only ever LENGTHENS a repeat. Ships WITH B1.
- **B3 — `zoneBoardV2` (ZoneBoard cost restructure):** spatial-keyboard LETTERS get the keyboardKey dwell (≈1485ms Mid, emits `data-gaze-context="keyboard"` so the real path honors it) instead of the heavier standardButton fall-through (≈1755ms); the zone-entry buffer shrinks from `max(1300, standardButton×1.5)`=2633ms Mid to `max(650, standardButton×0.45)`≈790ms. The 650ms floor keeps the invariant **buffer ≥ letterOnset+250** at every stage (verified 650/650/790/1053 vs the 400/500/550/650 requirement), so the buffer's pass-through mis-select protection is preserved while Mid per-letter cost drops ~6.5s→~4.3s.

**Disproven audit claims (verified against code, NOT acted on):**
- **"DELETE WORD dwell is faster than a letter (safety inversion)":** FALSE. Under real gaze the delete button carries `data-gaze-context="keyboard"` → 1485ms (identical to a letter); the 1085ms constant only drives the mouse-sim hover path, where it is already SLOWER than sim letters (700ms). No path has delete faster than a letter — no retiming applied.
- **"Sentence prediction is fully coded but NOT wired into any UI":** FALSE. It is wired end-to-end: backend `SentencePredictor` → `data.sentences` → `useWebSocket:420` → `App.tsx:328` → KeyboardScreen (ghost inline-completion + the nav-hidden sentence row), producing live bilingual results ("Mujhe pani chahiye", "I need suction"), now protected by the A2 Hindi guardrails. No new wiring needed; promoting sentences into the main 4-slot strip is a telemetry-gated (Tier C) decision A1 now enables.

**Deferred (needs its own focused pass):**
- **`hindiSpatial` — Hindi ZoneBoard (plan B5):** the spatial keyboard's `showHindi` prop is accepted but unused; it is English-only today. A Devanagari varga-based layout (क/च/ट/त/प-वर्ग + a vowels/matras zone) is the biggest single lift and the most valuable for this bilingual patient, but it is a new layout with matra-input UX decisions that need design iteration + rig testing, not a mechanical gated change. Scoped as a dedicated follow-up rather than shipped half-formed.

**Verification:** `npx tsc --noEmit` clean; `keyboard_tuning_benchmark.py` baseline intact (96.50% / tuned 97.42% — frontend changes don't touch the backend pipeline); `test_prediction_pipeline.py` 11/11; guardrail block/allow suite 0 failures; B1/B2/B3 decision logic + OFF-state identity + buffer invariant all unit-verified. On-rig A/B still required before any default flip.

**Rollbacks:** A1/A2/A3 `git revert` (measurement/safety/docs only — A2 also strengthens safety, unlikely to revert). B1/B2/B3 `window.__gazeFlags.set('<flag>', false)` (persists in localStorage; OFF = today byte-for-byte). Activate a test session with `window.__gazeFlags.set('keyboardCadence', true)`, `...set('repeatGuard', true)`, `...set('zoneBoardV2', true)` — then capture `window.__gazeTelemetry.snapshot().keyboard` before/after and hold the 10-selection abort gate before trusting the faster cadence.

## Entry 31 — 2026-07-06 — Patient live feedback: remove in-display suggestions + conversational word prediction

Two patient-driven changes on the keyboard screen (both ship ON — direct usability fixes, not A/B).

- **Removed the inline ghost sentence-completion inside the display box.** The greyed-out multi-line continuation drawn after the typed text (Gboard-style Smart Compose) was confusing — it read as part of what the patient had written. Removed the render, the `inlineCompletion` memo, and — critically — the Space-accept path (Space now only ever inserts a space, never a hidden sentence). The TOP word-prediction strip and the BOTTOM phrase buttons are untouched. Additionally, the bottom phrase buttons now filter to SHORT phrases only (`shortSentencePredictions`: ≤6 words / ≤42 chars) so a long patient-history echo can't fill two lines. `KeyboardScreen.tsx` only.
- **Conversational word-prediction scaffold (`word_prediction.py`).** Diagnosed from the patient's screenshot ("hello " → after/kijiye/you/the): conversational openers had little/no bigram signal, so next-word fell back to raw word frequency (the/you/want). Root causes: `hello`/`hi` entirely ABSENT from the bigram data, two-word contexts (`how are`, `are you`) not stored, and generic fillers over-ranked when bigram signal is weak. Fix: a curated `CONVERSATIONAL_SCAFFOLD` (≈60 one- and two-word contexts) applied AFTER neural fusion so it is authoritative, at base score 1.0 × 0.92^rank, but via `max()` so a stronger PATIENT-LEARNED score is never demoted (the patient's own history still wins — e.g. "are you " → **call** stays #1). Only fires for next-word (no prefix) in English mode and only for curated contexts; every other prediction (prefix completion, non-conversational next-word, starters) is byte-identical. Results: "hello " → how/good/there/everyone, "how " → are, "how are " → you, "nice to " → meet, "see you " → soon/later/tomorrow, "i am " → fine/feeling/good, "i love " → you, "good " → morning/evening/night. Note: "i"/single-letter words drop out of the model's context window, so the i-family continuations live under single-word keys (`am`, `feel`, `love`, `miss`). Curated words may be <3 letters (e.g. Hinglish "ho") since they are hand-picked; all still pass the guardrail + language filters at injection. Verified: `test_prediction_pipeline.py` 11/11, `py_compile` clean, control contexts unchanged, latency impact negligible (one dict lookup + ≤7-item loop). Tune/extend by editing the two dicts; revert by `git revert`. Follow-up: a Devanagari-mode scaffold (Hindi keyboard) and smarter STARTER predictions (empty text) are not yet done.

## Entry 32 — 2026-07-07 — Patient live feedback: comma boundary, short-word suggestions, toggle calm ON by default

Three patient-driven fixes from an on-rig session.

- **Comma/punctuation word-boundary bug (data loss) — FIXED.** After a comma, choosing a prediction (or the accept logic generally) replaced the last space-token — so `"hello,"` + selecting a word wiped the comma AND "hello". Two-part fix in `KeyboardScreen.tsx`: (1) smart-punctuation now appends a trailing space (`", "`) so a comma is a real word boundary and the next letter starts a new word; (2) `handlePrediction` replaces only the trailing LETTER run (`/[A-Za-zऀ-ॿ]+$/`), never punctuation or the word before it — if there's no trailing partial word it appends. Verified against the exact bug (`"hello, "` + "world" → `"hello, world "`, never `"world "`), plus mid-word completion, phrases, periods. 10/10 boundary cases pass.
- **Common short words (is, to, are, be, me…) now suggested.** The patient asked for 2-letter words like "is"/"to" to appear; `MIN_WORD_LENGTH=3` hid every 2-letter word. Added a curated `COMMON_SHORT_WORDS` whitelist (27 high-value function words) that bypasses the length filter ONLY on the context-driven paths (n-gram scan + fusion rebuild) so they surface only as genuine followers, never as clutter; plus scaffold entries (`this→is`, `going→to`, `want→to`, `he→is`, `there→is/are`, `let→me/us`, …). Results: "this "→is, "going "→to, "there "→is/are, "he "→is, "i have "→to, "let "→me/us — while greetings and all control contexts stay exactly as Entry 31. Pipeline 11/11.
- **`toggleCalmFrontend` flipped to DEFAULT ON.** The patient reported the gaze-toggle "magnetism is very very strong" across several sessions and that keys ABOVE the toggle get selected when reaching for it — both are the 220px/0.36 capture halo overlapping the top row. The Entry-29/30 calm (halo 220→150, strength 0.36→0.28, no teleport-to-centre, standard 250ms onset, 1450ms dwell, priority-bonus cap +0.3) is now the default. **Gaze-OFF→ON recovery is provably unaffected**: every calm branch in GazeCursor is gated on `&& enabled` (gaze ON), and the gaze-OFF toggle assist stays 140px/0.18 regardless of the flag (verified at GazeCursor.tsx:1559). Reverts instantly with `window.__gazeFlags.set('toggleCalmFrontend', false)`. NOTE: this was flipped ahead of a formal abort-gate session because the patient kept hitting it and does not enable flags manually — watch the first on-rig session; if turning gaze back ON ever feels harder, the backend gazetoggle magnet (165px/0.34/capture_full, unchanged here) is the next lever via `set_magnet_params`. The adjacent-key-steal has a residual accuracy component (gaze physically landing on a neighbour) that a smaller halo helps but calibration addresses more fully.

**Verification:** `npx tsc --noEmit` clean; `test_prediction_pipeline.py` 11/11; comma-boundary + short-word suites 0 failures; toggle change is flag-flip only (behavior already shipped + reversible). **Rollbacks:** comma/short-word `git revert`; toggle `window.__gazeFlags.set('toggleCalmFrontend', false)`.

## Entry 33 — 2026-07-07 — Cut keyboard "dead time" before the dwell ring (keyboardCadence default ON, onset-only)

Patient (Mid ALS, on-rig after recalibration) reported the wait from looking at a key to the dwell ring actually starting felt sluggish. Traced it: after every keypress the dwell loop returns early for the ENTIRE post-click cooldown (`GazeCursor.tsx:894`, `inClickCooldown`), showing NO ring; then the 250ms onset (still no ring); only then does the ring appear. At Mid that dead wait was ~1420ms cooldown (300×1.4 **+ 1000ms hidden hardcode**) + 250ms onset ≈ **1.67s** of pure waiting — with zero accuracy benefit.

**Key insight:** the sluggishness is DEAD TIME (cooldown + onset), not the dwell. Accuracy comes from the dwell time + Kalman smoothing, which are left completely alone. So we cut the dead time for free.

**Change:** `keyboardCadence` + `repeatGuard` flipped to **DEFAULT ON**. Reworked so the cadence overrides **only onset + cooldown** — the `letterDwell` field was removed from `KeyboardCadence` and the dwell-override block deleted from `_getEffectiveDwell`, so the dwell stays exactly `dwellSettings.keyboardKey` (patient: "don't touch dwell/smoothing"; also avoids a stage-detection edge case where forcing a dwell value could slow typing if the ALS stage wasn't explicitly applied). New per-stage onset/cooldown (dwell unchanged): caregiver 120/450 · early 150/600 · **mid 150/700** · late 200/850. At Mid the "look → next key's ring" dead time drops **~1.67s → ~0.85s (−49%)**. `repeatGuard` ships with it (continuity guard so the faster cooldown can't enable an accidental repeat). Files: `dwellTimeConfig.ts` (`KEYBOARD_CADENCE_BY_STAGE`), `GazeCursor.tsx`, `gazeFlags.ts`.

**Accuracy at distance (deferred, per patient):** the two attached logs showed the story is calibration, not software — 03:40 (pre-recal, at distance) had catastrophic tracker gaps (`MaxGap 4740ms`, edge-hold pinning); 03:48 (recalibrated, same distance) was clean (`MaxGap 97ms`, latency <0.83ms). Recalibration recovered it. No backend smoothing change now (more smoothing = more lag, which would fight this responsiveness win); handled as a separate measured pass + optional future "recalibrate" hint.

**Verification:** `npx tsc --noEmit` clean; onset/cooldown resolve to the new per-stage values and dwell is provably untouched (no code path forces a keyboard dwell now); `keyboardCadence` OFF reproduces today's timing exactly (unit-verified, 0 failures); `keyboard_tuning_benchmark.py` 96.50%/97.42% (backend unaffected). **Rollback:** `window.__gazeFlags.set('keyboardCadence', false)` restores the previous timing instantly (persists in localStorage).

## Entry 34 — 2026-07-07 — Vocabulary expansion + YouTube control-bar always-reachable toggles

Two patient-driven asks.

- **Keyboard vocabulary +239 common words.** Patient noted common longer words were missing ("initiatives" was the example). Added a new `GENERAL_ENGLISH_VOCABULARY` set (`word_prediction.py`) — common nouns/verbs/adjectives/adverbs, especially the multi-syllable ones (initiative, opportunity, information, comfortable, understand, celebration, tomorrow, everything, …). Wired into the `ALL_VOCABULARY` union so the words reach the prefix trie + fallback. Deliberately **availability-only, NO ranking boost** (unlike CORE/PATIENT), so they surface when you type their prefix WITHOUT changing the ranking of any existing prediction. Guardrails + MIN_WORD_LENGTH still filter the set. Verified: new words surface by prefix (initiative, opportunity, comfortable, understand…), every control context unchanged ("i want→water", "the→doctor", "hello→how/good", "medic→medicine"), predict latency unchanged, pipeline 11/11. Total vocab 2335→2574; init +~0ms.

- **YouTube control-bar: Show/Hide-Controls toggle + Show Nav always reachable.** The controls toggle used to vanish on non-video YouTube pages (search/listing) — it was gated to a playing watch page (`isYouTubeWatchPage && isPlayableYouTubePage`), and `toggleBrowserInteractionMode` early-returned on non-playable pages — so on a search page in control mode the patient saw only "Show Nav" and couldn't toggle the big controls. Fixed in `WebBrowsingScreen.tsx` (YouTubePanel): (1) removed the toggle's non-video early-return so it works on ANY YouTube page (the playing-video auto-mode effect only fires while playing, so a manual toggle on an idle page sticks); (2) un-gated the control-mode "Hide Controls" button so it's ALWAYS present alongside "Show Nav". Resulting layout (nav hidden): **watch** = Emergency·Back·Pause/Play·Next·Show Controls (Show Nav intentionally NOT in watch mode — patient wanted the buttons to spread out); **control** = Emergency·Back·Pause/Play·Next·Skip Ad·Hide Controls·Show Nav. From watch mode the nav is reached via Show Controls → control → Show Nav; nothing is a dead end. Scoped to the YouTube panel (the QuickSearch panel already had both toggle + Show Nav in control mode). tsc clean; no injected-browser-cursor code touched (replay harness unaffected).

## Known not-yet-done (honest status vs OptiKey/Dynavox)

- **Overlay-window cursor (deferred, flagship):** the cursor visuals still live INSIDE the page (an injected `position:fixed` div), not in a separate transparent always-on-top window like OptiKey's gaze mouse. Body-safe injection (Entry 21) closes the page-load gap, but a busy page main thread can still briefly stutter the in-page ring. The true never-stutters architecture (visuals in a click-through child `BrowserWindow`, dwell logic staying in-page for hit-testing) is scoped in a separate task, not in this branch.
- **On-rig validation pending:** Entries 17-27 are statically verified (parse, typecheck, 18 unit tests, replay baseline-identical) but NOT yet felt on the Tobii. Radius footprints especially need one on-rig pass — the pre-fix values were tuned in the mixed-unit regime, so the clean-unit feel may want a tweak.

## Rollback instructions (current state)

Each improvement reverts independently, without code edits:
- Speech back to old (blocking) behavior: set `GAZECONNECT_TTS_ASYNC=0` before `start-dev.bat`.
- Dwell behaviors back to old: in DevTools console — `window.__gazeFlags.set('dwellPauseOnGap', false)` and/or `window.__gazeFlags.set('lockBreakProgressRetention', false)` (persists across restarts).
- Browser-cursor behaviors back to old (persistent, survives page loads and restarts): in the MAIN app DevTools — `window.__gazeFlags.set('browserProgressRetention', false)` (Entry 7) and/or `window.__gazeFlags.set('browserGapPause', false)` (Entry 8), then re-enter the web screen. Per-page-only override still works via `window.gcConfig.*` in the BrowserView DevTools.
- Speech routing back to old behavior: `git revert` the Entry 14 commit (the old behavior — two overlapping voices — is itself the bug, so no runtime flag is provided).
- Telemetry additions are measurement-only (no behavior); removal = `git revert`.
- Transport/render changes (Entries 9–12) have no behavioral constants; revert their individual commits if needed.
- Web-cursor precision/comfort pass (Entries 17–22), persistent via `setGazeConfig` or per-page `window.gcConfig`: `focusOnResolve = true` (Entry 17 old behavior), `probeSnapEnabled = false` (Entry 19), `progressArcEnabled = false` / `cursorSmoothingMs = 0` (Entry 20), `{ edgeMinDeltaPx: 18, edgeMaxDeltaPx: 36, edgeThrottleMs: 120 }` (Entry 22). Entries 18/21/23 are behavior-neutral perf/crash/transport fixes — `git revert` only.
- Backend push broadcast back to paced loop: `GAZECONNECT_GAZE_PUSH=0` before `start-dev.bat` (Entry 24).
- Empty-dwell guard back to old behavior: `setGazeConfig({ emptyDwellGuardEnabled: false })`; card-scan cache back to per-frame scans: `setGazeConfig({ cardScanCacheMs: 0 })` (Entry 28; both persist across page loads via browserGazeConfig). The Entry-28 pre-filter/reorder/telemetry/highlight-gate pieces are behavior-neutral — `git revert` only.
- Hard rollback of everything: `git checkout de1aee6` (or revert the commits on top of it).
