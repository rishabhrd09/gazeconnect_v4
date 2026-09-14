# Eye tracking engineering audit and implementation

14 September 2026 · GazeConnect Pro working tree · OptiKey 3.2.5 local reference

## Outcome and limits

This review traced the relevant gaze acquisition, transport, validity, coordinate conversion, filtering, target acquisition, dwell, browser interaction, process lifecycle and Windows packaging paths in both projects. It is not a review of every unrelated OptiKey feature. The work includes substantial original implementation and regression tests. It does **not** certify a flawless experience, establish redistribution permission, measure physical Tobii performance, or produce a Windows installer on this Mac.

Detailed evidence:

- [OptiKey active paths, defaults and source references](optikey-gaze-reference-review.md)
- [Backend and helper changes](gaze-backend-audit.md)
- [Windows build and release audit](windows-release-audit.md)

Existing uncommitted work was present before this task. UI changes from that work were preserved. No Git commit, public upload, GitHub workflow dispatch or release publication was performed.

## What OptiKey actually does

The inspected version routes Eye Tracker 5 through its historical EyeX integration. Its defaults use vendor fixation processing and an adaptive Kalman path; key selection has a separate onset and a short-lived per-key progress store. Stable target identity and clear progress feedback matter as much as cursor appearance. The exact defaults and their branches are documented with source lines in the reference report.

Several assumptions in GazeConnect were incorrect. OptiKey's `GazeFilter.cs` gravity-well class is not included in its project build. Its optional weighted moving average is disabled by default. Its key hit test uses rectangle containment, rather than nearest-center selection. The source does not establish that every key fixation instantly freezes the cursor. Copying those alleged behaviors would not reproduce OptiKey's active implementation.

OptiKey also has weaknesses: stale/null handling can leave wall-clock dwell behavior that should not be reproduced, and point-fixation wiring does not consistently use the independently configured release radius. OptiKey source alone is not evidence of error-free hardware behavior.

## Changes implemented here

| Area | Problem found | Result |
|---|---|---|
| Helper callback | Network operations could delay the SDK callback; invalid samples could disappear silently | One replaceable latest-sample mailbox; bounded socket writes off the callback; invalid/silent-source reporting |
| Source integrity | Helper validity was ignored; timestamps and transport framing were insufficiently bounded | Explicit finite/valid/age/order checks, bounded framing and reconnect supervision |
| Coordinates | Undocumented edge stretching and physical/CSS unit guessing | Edge warp removed; explicit primary-screen DIP/content-DIP/viewport-CSS contract, manual correction applied once; outside-window gaze rejected |
| Filter provenance | Two classes explicitly described as ports, with distinctive matching formulas | Removed and replaced with an original elapsed-time adaptive cursor smoother; associated unused copied filtering/selection implementations removed |
| Filter ownership | Multiple filtering stages could accumulate lag | One active software estimator in Python; renderer/browser bypass extra WMA/EMA for `adaptive_cursor_v1` |
| Selection ownership | Dormant backend dwell duplicated renderer selection rules | Backend maintains target geometry; the renderer owns selection and the four fixed durations |
| Frontend validity | WebSocket projection dropped signal-state and timestamp fields | Preserves metadata and rejects invalid, repeated, reordered, old or nonfinite samples before subscribers see them |
| Tracking loss | Timeout enabled mouse hover, including a stationary old browser point | Input ownership stays latched; explicit simulation uses the backend; caregiver clicks remain available |
| Main dwell | Paused clocks could still run target/click logic; long loss retained progress indefinitely | Mandatory freshness guard returns before hit-testing; short loss pauses, long loss resets; renderer stalls cannot complete a dwell |
| Lock escape | Filtered coordinates could reinforce their own visual lock | Unfiltered, mapped `intent_x/y` controls release from an acquired target |
| Hover dwell | GazeButton could have a second mouse-driven timer alongside real gaze | Backend-controlled sessions suppress local hover timers; input-mode/disabled changes cancel outstanding timers |
| Browser selection | Short gap protection could be disabled; progress expiration extended with every gap | Mandatory gap guard, hard 1,000ms recovery horizon, explicit loss/hide resets, stale queued execution rejected |
| Browser backpressure | Per-frame page requests could accumulate or complete after pause | One outstanding page request per view; hide/navigation invalidates old requests; native mouse-down rechecks age and generation |
| Timing consistency | Browser and hover paths included onset inside the advertised dwell time | Selection duration and onset are separate across these paths |
| Windows runtime | Missing helper/model/floor-plan dependencies could still yield an installer | Complete validated staging and frozen self-tests; self-contained .NET; separate Python runtime folders |
| Process lifecycle | Global process killing in scripts; unbounded quick restart loop in Electron | Owned-process lifecycle, no unrelated process termination, bounded exponential restart attempts |
| Product claims | Settings called the app “Medical-grade” without evidence | Replaced with a factual communication/activities description |

Old in-app correction profiles are disabled because they belong to the previous coordinate mapping; new profiles carry a coordinate-space version. Tobii Experience calibration is preserved. Recheck the physical setup before using the new pipeline.

The new filter does not make calibration more accurate. It changes temporal response. Target assistance and display locking remain separate interaction mechanisms, with raw intent available to escape them. Existing target acquisition and magnetism still require patient-level evaluation; large capture zones can select the wrong neighbor even when the cursor looks steady.

## Four modes, one starting default

These are engineering starting values, not clinically validated prescriptions. Mode changes reset filter/acquisition history and do not change selection duration. “Balanced” is the common starting default, not a promise that one profile fits everyone.

| Mode | Settling time constant | Travel time constant | Display hold / release | Intended tradeoff |
|---|---:|---:|---:|---|
| Responsive | 30ms | 8ms | 1.5px / 4px | Faster movement, more visible noise |
| Balanced (default) | 55ms | 12ms | 2.5px / 6px | Moderate damping and movement response |
| Steady (`stable`) | 85ms | 16ms | 3.5px / 8px | More damping, slower settling |
| Gentle | 115ms | 20ms | 4.5px / 10px | Greatest damping, longest settling |

Time constants are not total latency or hard lock durations. The filter interpolates its response based on distance and uses `1 - exp(-dt/tau)`, rather than assuming every device supplies the same number of frames. Hold requires a target and sustained small movement. Large movement releases the hold; there is no velocity extrapolation or mandatory lock timeout.

Saved `normal`/`als_early` values migrate to Balanced and `als_late` to Gentle. The prior disease-stage labels were not evidence of suitability for a particular stage. Compare profiles with the same person, display, calibration and task.

The four selection intervals remain:

| Action | Dwell after onset |
|---|---:|
| Typing | 1,500ms |
| Communication | 1,800ms |
| Navigation and choices | 2,000ms |
| Deliberate actions | 2,800ms |

Onset, post-click cooldown, navigation pause and tracking-loss protection are additional safeguards. They must be included when measuring total time to select; quoting dwell alone understates perceived wait. There is no repeat-key acceleration or fifth duration.

The current Settings page is a pre-existing caregiver/mouse configuration surface with scrolling. The new four mode buttons fit that panel, but this audit does not claim all existing settings are independently gaze-accessible. A dedicated paged, gaze-accessible configuration flow remains an accessibility follow-up; do not describe the entire application as meeting the no-scroll/all-controls-by-gaze rule based on the limited visual checks below.

## Accuracy, stability and latency are different measurements

A calm cursor may be inaccurate if it is held on the wrong target. A filtered cursor cannot reveal the original sample error. Use known, independently specified intended targets when judging accuracy, and use unfiltered mapped intent when inspecting release behavior.

Measure at least:

1. Intended-target success, wrong-target activation, cancellation/recovery and correction rate.
2. Coordinate bias and dispersion at center, corners, edges and between adjacent targets, without snapping concealing the measurement.
3. Time from source acquisition through backend, transport and display, plus the complete onset/dwell/cooldown selection time. Report p50/p95/p99 and stalls, not just mean processing cost.
4. Escape time from a wrong target and successful reacquisition after a blink, unplug/replug, service restart or sleep/resume.
5. CPU, working set, handles, queue lengths and repeated reconnect behavior during a long session. A bounded algorithm is not evidence that the entire application never leaks.

Helper timestamps here begin at the SDK callback; they do not measure the tracker's internal optical/firmware processing delay. “Zero latency” is not a meaningful software acceptance promise. Camera optics, calibration, glasses, head position, lighting, display geometry and the person's eye movement remain part of the result.

## Verification performed

- TypeScript renderer and Electron compilation passed.
- Vite production build passed; its existing chunk-size/CJS warnings remain.
- Ten production-cursor/freshness tests use a virtual clock and DOM at 768px and 1080px heights: no sample, invalid/stale input, repeated/reordered timestamps, blink recovery, long loss, renderer stalls and target disabling.
- Ten fixed-dwell/preference regression checks passed.
- Twenty-four browser request/dispatch checks passed, including 10,000 incoming frames behind a blocked page, stale response rejection, pause/navigation invalidation and delayed native mouse-down cancellation.
- Eighteen injected-browser replay scenarios passed, including separate onset for all four durations, invalidation/hide, blink and long loss, TTL, zoom and bounded telemetry.
- Nine portable Windows bundle failure-injection tests and current vendor/assets input validation passed. These check structure and architecture, not vendor authenticity or DLL load behavior.
- Backend targeted suite: 54 tests run, 53 passed and one platform-dependent TTS check skipped. Full discovery additionally needs unavailable `torch` for an unrelated training test; model inference and hardware TTS were not exercised here.
- Browser visual checks: home at 1366×768 and 1920×1080 fits without document overflow or offscreen primary controls. The four mode buttons each measure 200×100 CSS pixels and fit within the settings panel at both sizes. Settings retains its existing internal scrolling. No all-screen visual certification is claimed.
- A Windows source-validation CI workflow was added; it has not been dispatched.

No physical Eye Tracker 5, Windows 10/11 runtime, PowerShell interpreter or .NET SDK was available for local native verification. No hardware latency/accuracy improvement percentage is claimed.

## Windows installation and sharing

On the Windows build machine, follow [the complete workflow](windows-release-audit.md):

```powershell
.\setup.bat
.\start-dev.bat --simulate
.\build-installer.bat
```

For real hardware development, use `start-dev.bat` without `--simulate`. The build creates an installer candidate only after staged and packaged resource checks succeed. End users should not need Node, Python, .NET or manual DLL copying when the frozen/self-contained candidate passes clean-machine verification. Tobii Experience, its driver/service, display setup and calibration remain vendor prerequisites. The script does not silently install those or accept their terms for the user.

Before sharing, test the **installed** artifact on clean Windows 10 and Windows 11 x64 machines without development runtimes, then run the hardware matrix in the Windows report. Include 100/125/150/200% scaling, windowed/maximized/fullscreen use, unplug/replug, sleep/resume, startup ordering, primary-monitor changes, offline TTS/prediction/floor-plan use, upgrade and uninstall. Mixed-DPI and secondary-display operation remain unverified: the present SDK adapter assumes the tracker is calibrated to the primary display. BrowserView focus behavior also needs native confirmation.

The .NET 8 migration is only a short-term step: support ends 10 November 2026. Electron 28 also requires a separate supported-version/security migration before broad release. Changing these versions safely requires Windows and embedded-browser regression coverage. [Microsoft support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)

## Licensing and provenance: unresolved release requirements

OptiKey's local license is GPLv3. The review found genuine implementation-level overlap in pre-existing Python code, not merely similar names. Replacing those implementations is necessary engineering work, but does not erase source history or prove every other file is independently authored. Do not remove attribution from code that remains derived, label the old code MIT by fiat, or claim a clean-room implementation: this review inspected the reference source. Determine the obligations for existing copies/history before publishing. [GNU license FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)

Tobii's published limited SDK agreement explicitly excludes AAC under Medical Use and restricts data exposure/storage. The repository's MIT license cannot override vendor terms. Establish which agreement covers these exact legacy DLLs, and obtain written permission covering intended AAC use, DLL redistribution, source-repository hosting and the internal transport/diagnostic arrangement. This is a concrete unresolved release question, not a claim that the latest public agreement automatically governs old binaries. [Tobii limited agreement](https://developer.tobii.com/pc-gaming/sdla/)

Tobii also describes separate development/distribution arrangements and a Medical Use option for its integration products. That page does not establish Eye Tracker 5 eligibility. Ask Tobii to confirm the exact hardware/SDK/use combination rather than assuming an open-source or free app is exempt. [Tobii SDK licensing](https://www.tobii.com/products/integration/tobii-sdk-license)

Review raw/processed gaze telemetry, fatigue metrics and debug trace retention against that agreement. Localhost transport is an engineering boundary, not a legal exemption. Public redistribution also needs a full dependency/font/native-library notice inventory and signing/security review. The installer manifest deliberately identifies an ordinary build as a local validation candidate; an approval JSON is only a maintainer attestation, not automated legal clearance.

## Future hardware and webcam boundary

Keep each vendor SDK inside its own adapter process. The shared contract should carry source/session identity, sequence, capture and receipt times, coordinate space/display identity, validity/confidence provenance and optional per-eye availability. The consumer owns mapping, filtering, target acquisition and dwell. Reconnection or a source/session change must reset every estimator and incomplete selection.

This work improves that separation with explicit validity/timestamps/units and a frame-rate-aware filter, but does not implement another hardware or webcam adapter. A webcam source needs independent calibration, confidence/loss thresholds, head-pose handling and larger-target validation. Do not train, compare or evaluate competing trackers using Tobii SDK data without verifying permission. Hardware independence should mean an interchangeable input contract, not a promise that webcam accuracy equals infrared tracking.
