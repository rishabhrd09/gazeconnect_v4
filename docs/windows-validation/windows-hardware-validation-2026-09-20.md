# Windows validation report — 20 September 2026

**Repository:** https://github.com/rishabhrd09/gazeconnect_v4.git
**Branch:** `featuring/ui-design-windows-production-refinement`
**Commit tested:** `e93a71b673e235bcc66c0c3cc66770a06f35b46b`
("Fix prediction learning recovery and Zone Board freshness")

Fresh clone into an empty directory. No branch switch, reset, commit, push or
installer publication was performed. Working tree was clean at the start and
carries only the changes listed under "Changes made".

This report records what was executed on **this one Windows 11 laptop with the
physical Tobii Eye Tracker 5 attached**. It is not Windows 10 evidence, not
clean-machine evidence, and not a certification of accuracy, latency or safety.

---

## 1. Machine under test

| Item | Value |
| --- | --- |
| OS | Microsoft Windows 11 Home Single Language, 10.0.26200 (build 26200), x64 |
| CPU | Intel Core i5-1135G7, 4 cores / 8 threads |
| RAM | 7.7 GB total (≈1.2–1.3 GB free during testing) |
| Disk free | C: 11.6 GB, D: 9.5 GB |
| Display | Single 1920×1080 @ 60 Hz, Intel Iris Xe, **100 % scaling** |
| PowerShell | 5.1.26100.9444 (Desktop) |
| Git | 2.47.0.windows.2 |
| Node | v24.13.0, x64 (repo validation baseline is Node 22) |
| npm | 11.6.2 |
| Python on PATH | **3.9.5 x64 — below the repo's 3.10 minimum** |
| Python used | 3.12.6 x64 (`%LOCALAPPDATA%\Programs\Python\Python312`) |
| .NET SDK | 6.0.428 at start; **8.0.425 installed during this session** |
| Tobii software | Tobii Experience 4.183.0.30025, `Tobii Service` running |
| Tobii device | `USB\VID_2104&PID_0313`, Tobii AB, WinUSB driver 2.5.0.5602, Status OK |

Ports 5173 / 8765 / 5050 / 5555 were free before every launch. No unrelated
process was terminated at any point.

### System-level prerequisites that required the operator

1. **.NET 8 SDK was not installed** (only the .NET 8 *runtime* and the 6.0.428
   SDK). `Assert-BuildTools` in `scripts/windows/Common.ps1` correctly refuses to
   continue without an `8.*` SDK, so the helper build and installer were blocked.
   Installed `Microsoft.DotNet.SDK.8` 8.0.425 via winget with the operator's
   approval and an elevation prompt.
2. **`python.exe` on PATH resolves to 3.9.5**, below the documented 3.10 floor.
   Python 3.12.6 x64 is installed but comes later on PATH. `setup.bat` detects
   and reports this correctly; all runs below prepend the Python 3.12 directory
   to PATH for the invoking shell only. **No system PATH was modified.** The
   operator should reorder PATH (or use the `py -3.12` launcher) before running
   `setup.bat` in a plain terminal.

No drivers were installed or changed. No system execution policy was changed
(the `.bat` entry points use process-scoped `-ExecutionPolicy Bypass`). No
Windows security protection was disabled.

---

## 2. Verdict

**Ready for local hardware use on this machine. NOT yet ready for installer
testing — the installer was not produced in this session (§7).**

Every automated check that this machine can run passes, and the real
Tobii path works end to end: vendor DLLs load under the self-contained .NET 8
x64 helper, gaze reaches the Python backend and the React UI, dwell selection
works, tracking loss is signalled rather than faked, and the tracker recovers
from a physical unplug without restarting anything.

**Not established here:** Windows 10 behaviour, clean-machine (no SDK)
installation, code signing, vendor redistribution rights, long-duration soak,
multi-monitor or non-100 % display scaling. See §9.

---

## 3. Commands executed and results

Run from the repository root. `python` = `python\.venv\Scripts\python.exe`.

### 3.1 Deliberate failure cases (error-propagation checks)

| Command | Exit | Result |
| --- | ---: | --- |
| `.\setup.bat -Simulate` with Python 3.9 first on PATH | 1 | **Correct** — "Python 3.10+ x64 is required. Python 3.12 x64 is the validation baseline." |
| `.\check-windows.bat` before `setup.bat` | 1 | **Correct** — "Missing required file: …\python\.venv\Scripts\python.exe" |
| `.\start-dev.bat --bogus` | 1 | **Correct** — "Unknown argument. Use --simulate and/or --skip-build." |
| `Assert-FreePorts` with port 8765 occupied by a test listener | throw | **Correct** — "Port 8765 is already in use (PID 9852). Close its owning app before launching. **No process was stopped.**" Owning process verified still alive afterwards; a free port was still accepted. |

### 3.2 Setup and readiness

| Command | Exit | Result |
| --- | ---: | --- |
| `.\setup.bat -Simulate` (PATH corrected) | 0 | PASS |
| `.\setup.bat` (full, incl. .NET 8 helper build) | 0 | PASS — `TobiiGazeHelper.dll` built, 0 warnings, 0 errors |
| `.\check-windows.bat -Simulate` | 0 | PASS — backend and floor-plan self-tests passed |
| `.\check-windows.bat` (full, incl. port 5555 + bundle) | 0 | PASS — source bundle verified, vendor SHA-256 recorded |

Backend self-test output included the deterministic predictor answering with
ten slots, and the floor-plan self-test reported `renderer: Cairo, solver: loaded`.

### 3.3 Node / TypeScript checks

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run build` | 0 | PASS — **Vite large-chunk warning still present** (`index-*.js` 739.39 kB). Not hidden, not reclassified. |
| `npm run build:electron` | 0 | PASS |
| `npm run typecheck` | 0 | PASS |
| `npm run lint` | **2** | **FAIL — pre-existing missing ESLint configuration.** "ESLint couldn't find a configuration file." No config exists at the repo root although ESLint and its plugins are devDependencies. Reproduced on Windows exactly as the Mac review reported. **Lint did not pass.** |
| `npm run check:word-slots` | 0 | PASS — 76 slot/insertion/freshness checks + 18 Zone Board checks |
| `npm run check:dwell-groups` | 0 | PASS — 11 fixed-duration/preference regressions |
| `npm run check:gaze-safety` | 0 | PASS — 10 gaze-safety regressions |
| `npm run check:browser-gaze-safety` | 0 | PASS — 24 checks, 10,000 busy frames dropped |
| `npm run check:browser-cursor` | 0 | PASS — 19/19 replay scenarios |

### 3.4 Python suites (project virtual environment, Python 3.12.6)

| Command | Exit | Tests | Result |
| --- | ---: | ---: | --- |
| `-m unittest discover -s python/tests -p "test_deterministic_*.py"` | 0 | 62 | PASS — spawns real prediction worker processes on Windows |
| `-m unittest discover -s python/tests -p "test_gaze_transport.py"` | 0 | 16 | PASS |
| `-m unittest discover -s python/tests -p "test_pipeline_mapping.py"` | 0 | 9 | PASS |
| `-m unittest discover -s python/tests -p "test_adaptive_cursor_filter.py"` | 0 | 6 | PASS |
| `-m unittest discover -s python/tests -p "test_prediction_pipeline.py"` | 0 | — | PASS |
| `-m unittest discover -s scripts/windows -p "test_*.py"` | 0 | 12 | PASS |
| `scripts/verify_windows_bundle.py source` | 0 | — | PASS — DLL PE/architecture, model inputs, prediction manifest hashes, English-only policy |
| `-m pip check` | 0 | — | "No broken requirements found." |

All counts match the Mac review, now reproduced on Windows with real worker
processes and the real toolchain.

---

## 4. The three Mac-review fixes — verified present

| Fix | Status |
| --- | --- |
| Malformed saved prediction state could block backend startup | **Present** — `python/services/deterministic_prediction/learning.py`: type guards on learned maps, `math.isfinite` rejection of non-finite counts/stamps, `OverflowError` caught, temporary files cleaned in a `finally` after a failed atomic save. |
| Delete Word removing learning from later spoken uses | **Present** — `learning.py` records `commitStamp`/`counted` per journal entry and unwinds newest-first, restoring recency only when the current stamp is the one it wrote. |
| Zone Board stale-prediction and reconnect handling | **Present** — `src/screens/SpatialKeyboardScreen.tsx` uses `predictionsAreFresh(predictionMeta, text)` gated on `connected`, resets slot lineage on entry/reconnect, re-requests on reconnect, and rejects a second activation before the new draft renders (`before !== text`). `src/App.tsx` passes `predictionMeta` and `connected`. |

Behaviour confirmed at runtime as well — see §6.

---

## 5. Real Tobii hardware results

All figures below come from the **physical Eye Tracker 5**, not simulation.
Mouse simulation was never used to infer any accuracy number.

### 5.1 Transport and DLL loading

- `TobiiGazeHelper.exe` (self-contained, `net8.0-windows`, win-x64) started,
  logged `[TOBII] Interaction stream initialized` and listened on 127.0.0.1:5555.
  This is direct evidence the vendor Interaction Library DLLs load under .NET 8 x64.
- Helper build output is x64; the three managed vendor assemblies carry an I386
  PE header, which is normal for AnyCPU managed assemblies. The repository's own
  `verify_windows_bundle.py` encodes exactly this rule (`machine not in (0x14C,
  0x8664)`, native DLLs must be `0x8664`) and passed.
- Python backend ↔ helper TCP connection observed **Established** on 5555 while
  the app ran.

### 5.2 Six-point coordinate alignment (calibrated, 1920×1080, 100 % scaling)

Operator fixated a 68 px target at each position; first 1.2 s per point discarded
as saccade/settle; 93 valid samples per point.

| Point | Median error (px) | Euclidean (px) | Sample spread σ (px) |
| --- | --- | ---: | --- |
| Centre | (−10.3, −12.7) | **16.4** | (5.6, 12.9) |
| Centre (repeat) | (−15.0, −21.4) | **26.1** | (4.9, 12.1) |
| Top-left | (−39.0, −35.5) | 52.8 | (14.1, 9.4) |
| Top-right | (−24.4, +26.9) | 36.3 | (10.6, 17.5) |
| Bottom-right | (+37.9, −13.4) | 40.2 | (10.3, 8.3) |
| Bottom-left | (−106.5, −19.7) | **108.3** | (17.6, 9.3) |

Median error **38.2 px**, worst **108.3 px** at bottom-left. Centre accuracy was
repeatable across two separate measurements (16.4 px and 26.1 px).

**Effective sample rate 33 Hz**, 100 % valid samples while the operator looked at
the screen.

Interpretation: centre and upper targets are well within an 80 px target.
The bottom-left corner degrades substantially — expected for a screen-bottom
mounted consumer tracker at extreme angle, and the reason the 60 px test margin
is harsher than any real UI target. At the bottom corners some individual samples
fell outside the normalised 0–1 range; the frontend's `isUsableGaze` **rejects**
out-of-range samples rather than clamping them to an edge target, which is the
safe behaviour for AAC and is covered by the automated gaze-safety suite.

**No coordinate mapping, filtering or dwell code was changed.** These are
measurements, not a basis for speculative tuning.

### 5.3 Tracking loss, unplug and reconnect

| Behaviour | Observed |
| --- | --- |
| No eyes / looking away | Helper emits `is_valid: false`, `confidence: 0.0`, `validity_source: "timeout"` after its 150 ms silence timeout, and increments `tracking_epoch`. Stale queued measurements are never re-emitted. |
| Physical cable unplug | Helper process **survived** (PID unchanged), kept serving the socket, emitted invalid samples only — **never a stale valid sample**. |
| Physical replug | **Gaze recovered ≈3 s after replug**, with no restart of the helper, backend or app. Second-by-second timeline: `x..V..VV.VVVVVVVVVVVV...` (`x` = invalid only, `V` = valid, `.` = no samples). |
| Unintended selection during loss | None observed; additionally covered by 10 automated gaze-safety regressions (invalid, non-finite, off-screen, `gap_hold`, `blink`, stale `t_helper_ms`/`sample_age_ms`, repeated/reordered source stamps, renderer stall). |
| Silent switch to mouse gaze after hardware loss | **Not observed.** Simulation is only enabled by the explicit `--simulate` flag (`GAZE_SIMULATE`). |

### 5.4 Helper client model (worth knowing for diagnostics)

`tobii-helper/TobiiGazeHelper/Program.cs:118-130` serves **exactly one** TCP
client: a new connection disposes the previous one. This is correct for
production (the backend is the only consumer), but it means an ad-hoc diagnostic
client and a running app will displace each other. An early capture of mine was
invalid for this reason; it was re-run against a standalone helper.

---

## 6. Prediction under real workload

Backend running with the real helper attached and the tracker connected.

- **Engine active by default:** `gazecompass-de33a95-port-1` (the deterministic
  predictor). No cloud predictor, LLM, neural replacement or new network
  dependency was added, and the legacy engine was never silently substituted.
- **Prediction worker is a separate process** — observed as a
  `multiprocessing.spawn_main` child of the backend, ≈108 MB.

### 6.1 Measured round-trip (WebSocket request → `predictions` reply)

Measured with `time.perf_counter()`; an earlier attempt using the asyncio loop
clock was discarded because Windows quantised it to ~15.6 ms.

| Measurement | Value |
| --- | ---: |
| Cold (first request after start) | **9.1 ms** |
| Warm, n = 120 — min | 5.7 ms |
| Warm — median | **15.2 ms** |
| Warm — p95 | 34.2 ms |
| Warm — p99 | 37.2 ms |
| Warm — max | 39.5 ms |

This is the **full client-visible round trip** over loopback WebSocket including
JSON encode/decode and asyncio scheduling, not the engine's internal time, and it
was measured on a memory-constrained machine (≈1.2 GB free) with other validation
work resident. It is **not** tracker-to-selection latency and does not support any
claim of zero latency.

- **Stale-request suppression works:** a burst of four requests produced exactly
  **one** reply, for the **last** request (`i need wate`).

### 6.2 Functional checks against the live backend and real UI

| Check | Result |
| --- | --- |
| Ten word slots, all completing the typed prefix, distinct | PASS |
| Separate phrase suggestion (not occupying a word slot) | PASS — `prediction` context renders 11 cells = 10 words + 1 phrase |
| Documented fresh-profile result for `i need wa` | **Reproduced exactly** — top `water wasn't warm want wait`, bottom `was walk watch wake way`, phrase `I need water` in the top-right cell |
| Select `water` | `i need wa` → `i need water ` — inserted **exactly once** |
| Delete Word | → `i need ` and the learned acceptance was **undone** (`acceptedWords: {}`) |
| Committed-use learning | Confirmed: an accidental phrase selection recorded `need`, `some`, `rest`; `reset_word_learning` cleared them via the app's own path |
| Partial-word completion, apostrophes (`i don't `), punctuation (`hello. `), empty draft | PASS |
| English-only slots (no non-ASCII) | PASS |
| Saved-state recovery / persistence | `data/patient_data/deterministic_prediction_state.v1.json` written atomically, untracked and gitignored, survived a backend restart |
| Zone Board — 5 alphabet groups | PASS — `A B C D E F`, `G H I J`, `K L M N O P`, `Q R S T`, `U V W X Y Z` |
| Zone Board — 6 suggestions | PASS |
| Shared message across keyboards | PASS — draft `i need ` carried from the traditional keyboard into Zone Board |
| Backend kill → restart | Backend auto-respawned; client reconnected; **draft preserved**; suggestions returned **without another keystroke** |
| Prediction worker orphaning | **None** — killing the backend took the worker with it; closing the launcher left no Python process |

**Slot-order caveat worth recording:** slot positions are *lineage-dependent by
design*. With a contaminated draft, intermediate readings put `way` in a
different bottom-row position. With a genuinely empty draft and reset learning
the documented order reproduced exactly. A tester who does not clear the draft
first may see a different arrangement and should not treat that as a regression.
`docs/windows-local-testing.md:54` is correct as written.

---

## 7. Installer — INCOMPLETE IN THIS SESSION

**Status: not produced. No installer was published and no release directory exists.**

`build-installer.bat` could not be run to completion from the automation session.
Every launch method was terminated part-way by the session's process lifetime,
**not** by a defect in the script:

| Attempt | Reached | Outcome |
| --- | --- | --- |
| Foreground | PyInstaller (backend) analysis | Cut at the 10-minute foreground call cap |
| Detached (`Start-Process`) ×3 | Just past `npm ci` | Process killed, no error written |
| Windows Task Scheduler (2 h limit) | `npm ci` → source-bundle verify → **full frozen backend built successfully** | Exited 1 at the floor-plan freeze; its buffered output was lost, so no error text was captured |
| Floor-plan freeze in isolation | PyInstaller analysis progressing normally at 38 s | Confirmed the step itself works; stopped deliberately |

What this **does** establish on Windows:

- `Assert-BuildTools`, `pip check`, `check_python.py --pyinstaller` and
  `verify_windows_bundle.py source` all pass as the build's preconditions.
- `npm ci` completes (598 packages) and `electron-builder.cmd` is present.
- **The frozen backend builds successfully with PyInstaller 6.22.3**, including
  the deterministic-prediction assets, the English-only policy, the
  `services.deterministic_prediction.worker` hidden import and `--collect-all onnxruntime`.
- The floor-plan freeze starts and progresses normally when given uninterrupted time.

What remains **unverified**: floor-plan freeze completion, self-contained .NET
helper publish, staged and packaged `verify_windows_bundle.py` runs, the frozen
backend/floor-plan `--self-test` executions, `multiprocessing.freeze_support`
behaviour in the frozen worker, electron-builder output, installer SHA-256,
installation into a path containing spaces, writable user-data locations,
relaunch/upgrade/uninstall behaviour, orphan processes after an installed-app
exit, and `check-windows.bat -InstalledPath`.

The build machine also has only ~0.8–1.3 GB free RAM of 7.7 GB, which makes the
two PyInstaller passes slow; this is worth noting for anyone reproducing it.

**To complete this section**, run from the repository root on this machine and
allow 15–25 uninterrupted minutes:

```powershell
.\build-installer.bat
```

Then install the `.exe` from `release\<runId>\` and run, with the installed app
closed:

```powershell
.\check-windows.bat -InstalledPath "C:\path\to\GazeConnect Pro"
```

The script writes `release\<runId>\installer-sha256.json` and
`release\<runId>\build-manifest.json`; the manifest is stamped
`LOCAL-VALIDATION-CANDIDATE-NOT-FOR-DISTRIBUTION` unless `-Distribution` is used
with a reviewed approval file. **No approval evidence was fabricated and no
`-Distribution` build was attempted.**

---

## 8. UI and navigation

Measured in the real running app (Vite + Electron backend, live WebSocket) by
reading the actual DOM geometry of every `.gaze-button`.

| Screen | Viewport | Theme | Targets | < 80 px | Overlaps | Off-screen | Scrolls |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| Home | 1920×1080 | Dark | 14 | none | none | none | no |
| Traditional keyboard | 1920×1080 | Dark | 49 | none | none | none | no |
| Home | 1366×768 | Warm | 14 | none | none | none | no |
| Traditional keyboard | 1366×768 | Dark | 49 | none | none | none | no |
| Traditional keyboard | 1366×768 | Warm | 49 | none | none | none | no |
| Keyboard, navigation shown | 1366×768 | Warm | 51 | none | **none** | none | no |
| Zone Board | 1366×768 | Warm | 21 | none | none | none | no |

- **All five selection durations are present in the live DOM** on the keyboard
  (`data-gaze-dwell-ms` ∈ {500, 1000, 1250, 1500, 2000}) and nothing else.
  Word slots and alphabet groups both read 1000 ms.
- The previously reported gaze-toggle / Quick Words collision was **not present**
  with navigation shown.
- Smallest prediction cell measured 320×108 px at 1920×1080 and 108 px minimum
  dimension overall — comfortably above the 80 px floor.
- Gmail, LinkedIn and WhatsApp remain **"Coming soon"** (`src/screens/WebBrowsingScreen.tsx:3276-3298`).
- No Devanagari characters anywhere under `src/` — interface is English-only.
- Only Warm and Dark themes; both render correctly at both sizes.
- `AlertModeScreen.tsx` still present; no global emergency button is rendered.
  The `emergencyButton` key survives only as a *dwell group* mapping to the
  2000 ms deliberate duration for home care cards.

**Tested at 100 % scaling only** — this machine has a single 1920×1080 display.
125 % and 150 % scaling, multi-monitor and window-move behaviour are untested.

### 8.0 Constraint evidence from the diff

Across all nine branch commits (`c19bada..e93a71b`), only these files under
`src/` changed: `App.tsx`, `hooks/useWebSocket.tsx`, `screens/KeyboardScreen.tsx`,
`screens/SpatialKeyboardScreen.tsx`, `styles/keyboard-layout.css`,
`styles/zone-board.css`, `utils/predictionContext.ts`,
`utils/wordPredictionSlots.ts`, `utils/zoneBoardText.ts`.

**Untouched by the branch:** `src/config/dwellTimeConfig.ts` (the five
durations), `src/utils/design.ts`, `src/warmmode.css`, `src/refinement.css`
(themes), `electron/`, and `tobii-helper/`. No other screen file was modified,
so screen names, phrases, board content and spatial layout outside the two
keyboards are unchanged by construction, and no Tobii DLL, coordinate-mapping,
filtering or dwell code was altered.

### 8.1 Windows speech (SAPI5)

Verified on real Windows, which the Mac review could not do.

| Check | Result |
| --- | --- |
| `python -m unittest … test_tts_available.py` | PASS — 5 tests; engine reports "async worker mode" default |
| SAPI5 voices present | 3 — Microsoft David Desktop (en-US), Hazel Desktop (en-GB), Zira Desktop (en-US) |
| `pyttsx3.init('sapi5')` | PASS — 219.5 ms |
| Actual spoken output (`say` + `runAndWait`) | **PASS — audible**, 1,978.6 ms for a short phrase; rate 200, volume 1.0 |

---

## 9. What remains untested

1. **Windows 10** — nothing here is Windows 10 evidence.
2. **Clean machine** — this is the build machine and has Node, Python and the
   .NET 8 SDK installed. It cannot prove a recipient without developer runtimes
   can install and run the app.
3. **Display scaling other than 100 %**, multi-monitor, and window movement
   across monitors.
4. **Long-duration soak**, fatigue behaviour, sleep/resume.
5. **Calibration quality across users** — a single operator's calibrated session.
6. **In-app speech routing** — the speech engine itself is verified (§8.1), but
   which screen speaks what was not walked through end to end.
7. **Code signing, vendor redistribution rights and public-distribution gates** —
   `docs/windows-release-audit.md` gates remain unmet. The build script's
   `-Distribution` path requires an external approval record naming the vendor
   agreement, a Windows hardware test report and third-party notices, and it
   verifies the vendor DLL hashes against it. **No approval evidence was
   fabricated and no distribution build was attempted.**
8. **Upgrade and uninstall over a previous installation** — no prior GazeConnect
   installation exists on this machine (the `…\Local\Programs\GazeConnect Pro`
   folder is empty and there is no uninstall registry entry).

### Existing user data on this machine

`%APPDATA%\gazeconnect-pro` contains **223.7 MB / 10,700 files**, including
`settings.json` (dated 11 July 2026) and `runtime-data` (6 March 2026). This is
the **development** Electron userData directory. A packaged build uses
`%APPDATA%\GazeConnect Pro` (productName), which does not exist, so installing
does not touch it. It was left untouched and its contents were not read.

---

## 10. Changes made in this checkout

**No source file was changed. `git status` is clean against
`origin/featuring/ui-design-windows-production-refinement`.**

Validation found no defect in the branch's code that required a fix. The only
file added is this report, under the gitignored `tools/reports/` directory (a
copy is placed in `docs/` so it can be committed if wanted).

One edit was made and then **reverted**: `docs/windows-local-testing.md:54`
records the fresh-profile slot order for `i need wa`. An intermediate reading
appeared to contradict it, so the line was corrected — then a clean re-test with
a genuinely empty draft and reset learning reproduced the documented order
exactly, so the edit was reverted. The line is correct as written. The
intermediate disagreement was a *slot-lineage* effect from a contaminated draft,
which is documented here (§6.2) so the next tester does not repeat it.

### Observations not fixed (deliberately out of scope)

| Observation | Why not changed |
| --- | --- |
| **No ESLint configuration** — `npm run lint` exits 2 | Pre-existing and already documented in `README.md` and the Mac review. Adding a config is a separate change that would surface an unknown number of new findings; it is not a "smallest suitable correction" for a validation pass. **Reported, not concealed.** |
| **Vite large-chunk warning** (`index-*.js` 739 kB) | Pre-existing and documented; a bundling redesign is explicitly outside this scope. |
| **`CLAUDE.md` contradicts `AGENTS.md`** — it still states "Bilingual: English + Hindi", "Emergency buttons must ALWAYS be accessible … user-adjustable 1400–4000 ms" and ".NET 6.0" | These directly contradict current non-negotiable constraints and the shipped code (English-only, no global emergency buttons, five fixed durations, .NET 8). `AGENTS.md` is current and correct. Worth reconciling, but rewriting project instruction files was not requested. |
| **Large generated artefacts are tracked in git** — `session-A-console.txt` (1.5 MB), `session-B-console.txt` (3.4 MB), `tmp_diff.txt`, `tmp_diff2.txt`, `errors.txt`, `ts_error.txt`, `test_500.py`, `test_500_full.py` | Repository hygiene, not a functional defect. Console dumps of this kind can carry personal content, which the project's own logging rules warn against; worth reviewing before any public release. Deleting tracked files was not requested. |
| **Helper serves one TCP client** (`Program.cs:118-130`) | Correct for production; documented in §5.4 only so diagnostics are not misread. |

---

## 11. Logging and safety compliance

- `GAZE_DEBUG` was left at its default `0` for every run.
- No continuous gaze log was streamed into the session. All captures were
  bounded in time and reduced to aggregate statistics before being reported.
- No raw gaze recording and no spoken message content was retained; the only
  drafts exercised were synthetic test strings (`i need wa`).
- No unrelated process was terminated to free a port. Only processes belonging to
  this checkout (matched by command line / image path) were stopped, and only to
  recover from a launch of mine that had started the app with a hidden window.
- No driver was installed or modified; no Windows security protection was disabled.
