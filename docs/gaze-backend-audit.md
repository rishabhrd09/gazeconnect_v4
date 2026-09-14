# Acquisition and backend gaze audit — 2026-09-14

This audit covers `tobii-helper/TobiiGazeHelper/Program.cs`, TCP ingestion in `python/main.py`, coordinate conversion, conditioning, filtering, target assistance, and WebSocket delivery. It does not establish Windows hardware compatibility, a universal patient profile, measured end-to-end sensor latency, or permission to redistribute vendor components. Those require the Windows and licensing release checks described in the project review.

## Findings and implemented corrections

| Area | Previous behavior | Current behavior |
| --- | --- | --- |
| SDK callback | Synchronous TCP serialization/write could block Tobii's callback; connections could leak when replaced. | Callback publishes to one replaceable mailbox. An event wakes a dedicated transport worker. Bounded write timeout and disposal on replacement/failure. |
| Invalid tracking | NaN silently dropped; infinities were not rejected; coordinate repetition was classified as frozen. | Nonfinite values fail closed. A steady repeated position is allowed when source time advances. Repeated/regressed source time is invalid. Source silence produces an invalid message after 150 ms. |
| Lost transition coalescing | A latest-only queue could overwrite an invalid sample with the next valid sample. | Helper tracking epoch preserves the intervening invalid edge. Receiver emits that edge before accepting the new point. |
| TCP framing | A growing string buffered arbitrary data without a newline; no read watchdog. | 16 KiB maximum newline message, finite/typed field checks, 150 ms silent-source watchdog. |
| Reconnect | Ten initial attempts, detached retry tasks, and a possible retry after explicit disconnect. | One cancellable supervisor retries while running. Shutdown cancels reads and retry sleep and closes the writer. |
| Validity | Helper `is_valid` was ignored; absent values defaulted to valid gaze at screen center. | Explicit false overrides eye flags; missing validity, malformed/nonfinite data, and malformed timestamps cannot be selectable. Combined validity is identified as combined, not per-eye measurement. |
| Coordinates | Fixed 2.5% horizontal and 3.5% vertical edge expansion moved otherwise calibrated coordinates. Out-of-window gaze was clamped to selectable borders. | No generic edge expansion. Out-of-screen/out-of-window measurements are invalid. Vendor calibration determines the source geometry. |
| Damping | Vendor LightlyFiltered data passed through a Kalman/WMA and four-zone filter explicitly described as OptiKey ports, plus cursor magnetism. | One original elapsed-time adaptive exponential smoother operates in viewport CSS pixels after mapping. The copied filter implementations and unused fallback filter module were removed. Existing target magnetism remains a separate assistance step. |
| Selection owner | Backend had an unused second selector with conflicting 200–1200 ms durations, acceleration and incomplete-progress banking. | Backend contains only a bounded target registry. React owns dwell timing and completion; the four durations in `src/config/dwellTimeConfig.ts` remain authoritative. |
| Gaps | Some invalid states passed through filtering; a held valid payload could be rebroadcast under a disabled safety flag. | Invalid/stale/future/out-of-order samples never update calibration, filtering or target assistance. Held positions are always `is_valid:false`; original acquisition time is preserved. |
| Reacquisition | Prior filter/target state could pull resumed gaze to the previous position. | Smoother and target ownership reset on invalid input, long gaps, changed profile/geometry, removed targets, and screen changes. |
| WebSocket pressure | A new fire-and-forget send task was created for every gaze frame/client. | At most one gaze send task per client; busy consumers skip superseded samples and are closed if blocked. Another consumer remains independent. Queued samples are checked for freshness before send. |
| Inactive window | Full-screen gaze could remain actionable while the app was minimized or another app was foreground. | Live tracking waits for content geometry and `gazeActive:true`. Main-window visibility, minimization and foreground state gate measurements; unchanged periodic geometry reports do not reset filtering. |
| Calibration persistence | A saved correction could be applied after changing the input coordinate mapping. | New profiles carry `window_normalized_v2`. Older profiles are ignored, and a content-size mismatch disables the correction. This leaves the Tobii Experience calibration intact. |
| Logging | Helper logged gaze coordinates each ~60 frames at default settings. | Helper gaze logging requires `GAZE_DEBUG=1`/`--verbose`. Python sample/classifier/correction diagnostics use debug level; default runtime output contains lifecycle information. |

## Four smoothing modes

Balanced is the general starting point, not a claim that one setting fits everyone. Legacy `normal` and `als_early` map to Balanced; `als_late` maps to Gentle. There is no inference about disease stage.

| Mode | Settle time constant | Travel time constant | Target hold / release distance | Stable time before a hold |
| --- | ---: | ---: | ---: | ---: |
| Responsive | 30 ms | 8 ms | 1.5 / 4 CSS px | 90 ms |
| Balanced | 55 ms | 12 ms | 2.5 / 6 CSS px | 120 ms |
| Stable | 85 ms | 16 ms | 3.5 / 8 CSS px | 150 ms |
| Gentle | 115 ms | 20 ms | 4.5 / 10 CSS px | 180 ms |

`adaptive_cursor_filter.py` uses the standard first-order response `alpha = 1 - exp(-dt/tau)`. Distance from the current filtered point to the measurement changes `tau` continuously between settling and travel values. It uses convex interpolation, so it cannot predict past the measurement or amplify a step into overshoot. Its memory use is constant. A tiny display hold requires an already acquired target; leaving its release distance or changing targets releases immediately. These constants affect motion only, and do not change the four fixed selection durations.

More smoothing always introduces some lag; a small hold trades motion for local precision. Large intentional motion receives a short time constant. Calibration error, posture change, monocular tracking, glasses, fatigue, sunlight and display configuration must be assessed on the actual rig. No software filter can recover an unmeasured true fixation from a systematically biased input.

## Coordinate and timing contract

1. The current adapter uses the installed **Tobii Interaction** library with `GazePointDataMode.LightlyFiltered`; the unused Stream Engine interop declarations are not the live acquisition route.
2. The helper reports coordinates normalized to the primary screen. It sends acquisition epoch milliseconds, the original device timestamp, a helper monotonic timestamp, and a tracking epoch. The combined stream does not expose separate eye validity or a calibrated confidence score; `0.75` is a conservative application policy value, not a measured accuracy estimate.
3. Electron supplies primary-display DIP width/height and origin, content DIP bounds, CSS viewport width/height, and `screenUnits:'css'` to explicitly bypass the old physical-vs-CSS heuristic. Despite the legacy names `physicalWidth`/`physicalHeight`, these fields contain DIP dimensions in this path. The conversion is `(normalized * primarySize + primaryOrigin - contentOrigin) / contentSize`, then viewport CSS scaling. Manual offsets remain CSS pixel offsets.
4. `intent_x`/`intent_y` identify valid, calibrated window-normalized input before cursor damping and magnetism. The renderer can use this intent to release target locks without feeding the already locked cursor back into the release decision.
5. `x`/`y` are the assisted display coordinates in window-normalized space. `signal_state:'valid'`, `is_valid:true`, and fresh acquisition time are required for selection eligibility. A newer send timestamp does not refresh an older acquisition timestamp.
6. Epoch time is used only to align acquisition with send/arrival clocks on the same machine. Watchdogs and local elapsed controls use monotonic time. Device time must not be divided or treated as epoch without an adapter-specific clock contract.

Primary-display tracking is the supported coordinate basis. These changes do not claim multi-display Tobii calibration or correct arbitrary mixed-DPI configurations without on-device validation. Window moves, title bars, zoom, 100/125/150/200% display scaling, display reconnection, and minimize/focus transitions must be exercised on Windows. External BrowserView cursor routing has its own mapping and should be included in that exercise.

A future hardware/webcam adapter should produce `GazePoint` with explicit finite coordinates, acquisition time, validity and provenance; emit loss/reconnect transitions; and define its screen/calibration basis. It should not add a second dwell clock or conceal unavailable confidence values.

## Validation performed on this host

- `python3 -m py_compile python/main.py python/services/*.py`: passed.
- Targeted Python suite: **54 tests run: 53 passed; 1 existing platform-dependent TTS smoke test skipped**. Command:

  ```sh
  python3 -m unittest python/tests/test_adaptive_cursor_filter.py python/tests/test_gaze_transport.py python/tests/test_pipeline_mapping.py python/tests/test_gap_hold_mark.py python/tests/test_magnet_params.py python/tests/test_prediction_pipeline.py python/tests/test_tts_available.py
  ```

- Tests cover coordinate conversion including zoom/content origin; nonfinite/off-screen/stale/future/out-of-order samples; always-invalid display holds; source silence without further samples; reconnect after initial failure; cancellation; bounded framing; superseded invalid transitions; slow-client isolation; target removal; foreground gating; unchanged geometry; legacy calibration; four mode aliases; steady gaze; sample-rate-independent response; no step overshoot; and prompt release.
- Synthetic 30/60/120 Hz constant-time response test agrees within `1e-8` CSS px. Every mode stays within the measured step endpoints and reaches within 10 CSS px of an 800 px step within 200 ms in the deterministic 60 Hz test. These are algorithm tests, not hardware latency or clinical performance measurements.
- Existing synthetic CSV replay: **2,298 samples**, fixture rate **133 Hz**, balanced central fixation RMS **0.62 CSS px**. Fixture frequency is an input, not an ET5 hardware rate claim; the fixture's transition-contaminated segments are not absolute accuracy measurements.
- Full Python discovery also attempts an unrelated ML training test that cannot import `torch` on this host. No training dependencies were installed to make an unrelated test pass. Optional ONNX inference and hardware TTS are unavailable in this environment.
- No .NET SDK or Windows/Tobii hardware is available on this macOS host. The helper has been statically reviewed, but its Windows build, SDK loading, actual device timestamps/reconnection, install-time dependency closure, and end-to-end latency remain release gates. No claim of a generated or verified Windows installer follows from these Python tests.

## Provenance and release status

The working tree previously contained code explicitly described as OptiKey ports. This change removes those active filters, their unused filter fallbacks/patch recipe, and the inactive backend dwell/timer implementation instead of renaming them or deleting attribution while keeping their code. The replacement smoother and target registry were authored for this application's timing and coordinate contracts. Historical Git commits, release artifacts, other files, dependencies and binary redistribution terms still require review. This audit is not legal clearance, a clean-room certification, or a substitute for vendor redistribution rights.
