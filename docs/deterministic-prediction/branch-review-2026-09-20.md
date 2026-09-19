# Unpushed branch review — 20 September 2026

Reviewed `featuring/ui-design-windows-production-refinement`, upstream base
`c19bada`, through `655fb1b`. Nine commits were ahead of the locally recorded
upstream. No branch switch, commit, push or installer publication was performed.

**Assessment:** suitable to proceed to Windows hardware validation after including
the fixes below. This is not Windows installer certification or a guarantee of
prediction accuracy, gaze accuracy, or zero latency.

## Commit coverage

| Commit | Reviewed change |
| --- | --- |
| `e2ad279` | Deterministic engine, assets, provenance and ranking contracts |
| `644d0e4` | Backend integration, worker process, committed-use learning |
| `62f30c3` | Guardrail inflections |
| `3759cc3` | Phrase and training-data inventories |
| `fc07d69` | Export, parity, evaluation and runtime tools |
| `f3ed75e` | Predictor and Windows validation documentation |
| `fbb09d8` | Tests and pinned parity fixtures |
| `681337b` | Ten traditional-keyboard word slots, insertion and freshness |
| `655fb1b` | Windows prediction assets and frozen-worker self-test |

## Findings corrected during this review

1. **Malformed learning data could prevent backend startup.** Valid JSON with an
   incorrect structure raised uncaught attribute errors; infinite numeric values
   could raise overflow errors. Validate maps, recover malformed state, skip
   invalid legacy records and nonfinite counts. Valid legacy files remain untouched.
   Failed atomic saves now clean their temporary files before retrying.
2. **Delete Word could erase unrelated committed learning.** Accepting a new word,
   speaking it, then deleting the acceptance removed both uses. Undo now removes
   only the recorded increment, preserves later recency, unwinds repeated
   acceptances in reverse order and handles capped counts correctly.
3. **Zone Board lacked full-draft freshness and reconnect handling.** Prefix-only
   filtering accepted old-context predictions after spaces/deletions. It now
   uses backend results only for the current draft and connection, uses existing
   offline suggestions otherwise, and requests fresh predictions on reconnect
   without requiring another keystroke. It also rejects repeat activation before
   the new draft renders and resets slot lineage on entry/reconnection.

These changes do not alter screen layout, content, themes, dwell durations,
Tobii sampling, coordinate transforms, filtering or native browser injection.

## Verification performed

| Check | Result |
| --- | --- |
| Frontend TypeScript/Vite production build | Pass, including after fixes |
| Electron TypeScript build | Pass |
| Deterministic Python suite | 62 tests pass on Python 3.11 and 3.14 |
| Pinned reference fixture replay | 6,186 snapshots and 542 lineage steps pass across 3,113 cases |
| Word-slot/insertion/context checks | 76 pass |
| Zone Board text/prefix/order checks | 18 pass |
| Fixed dwell/preference regressions | 11 pass |
| Frontend gaze safety | 10 pass |
| Native browsing request/click safety | 24 pass; 10,000 busy frames dropped |
| Injected browser cursor replay | 19/19 scenarios pass |
| Python gaze transport | 16 pass |
| Python coordinate/pipeline mapping | 9 pass |
| Adaptive cursor filter | 6 pass |
| Windows bundle validator unit tests | 12 pass |
| Source bundle validation | Pass: DLL PE/architecture checks, model inputs, prediction manifest hashes and policy |
| Working-tree whitespace check | Pass |
| ESLint | Blocked by the pre-existing missing ESLint configuration |

The Vite build also retains its large-chunk warning. Neither warning was hidden
or reclassified as a passing check. No lint configuration or bundling redesign was
introduced as part of this focused prediction review.

The deterministic suite includes worker crash recovery, stale-request suppression,
disconnect handling and worker exit after backend termination. Reference parity
tests use the reference policy; production guardrails and English-only policy are
tested separately. Passing these tests establishes implementation consistency,
not universally correct word/phrase suggestions.

## Live UI inspection

Used the actual Vite frontend and Python process predictor over loopback, with
Tobii disabled and temporary backend data. TTS and native desktop automation were
unavailable in this Mac test environment.

- Inspected traditional keyboard in Warm and Dark at 1366×768 and 1920×1080;
  checked navigation-visible and keyboard-first states. Inspected Zone Board at
  both viewport sizes. Measured controls stayed inside the viewport and above
  the 80 CSS-pixel minimum in the inspected states.
- Checked the previously reported gaze-toggle/Quick Words collision; navigation
  controls did not overlap. Existing message display and theme styling remain.
- Verified ten populated word slots, selection from the lower row, `wa` → `water`
  completion, Delete Word and shared message preservation across the two keyboards.
- Stopped/restarted the test backend while Zone Board remained open: existing
  offline suggestions appeared, then backend suggestions returned automatically
  for the unchanged draft after reconnect.
- Other screen layouts were not modified by the nine commits. This focused live
  check does not substitute for testing every activity and native browsing flow
  in Electron on Windows.

## Gaze and timing assessment

The nine-commit diff contains no changes to `tobii-helper/`, `electron/`, core gaze
components or `src/config/dwellTimeConfig.ts`. The backend changes integrate
prediction; existing coordinate mapping and gaze transport tests pass.

A 15-second-per-mode synthetic 66 Hz event-loop benchmark on this Mac measured:

| Measurement | Idle | Process predictor active |
| --- | ---: | ---: |
| Gaze scheduling lateness, median | 1.041 ms | 1.040 ms |
| Gaze scheduling lateness, p99 | 2.083 ms | 10.026 ms |
| Maximum scheduling lateness | 2.113 ms | 12.490 ms |
| Frames over 15 ms late | 0% | 0% |

95 prediction requests completed; round-trip median was 5.705 ms and p95 was
17.530 ms. Other validation work was running on the machine, so these are
observations under that workload, not isolated performance baselines. This
measures event-loop scheduling, **not** tracker-to-selection latency or physical
coordinate accuracy. It does not justify claiming no effect on latency.

## Windows validation still required

The scripts target Windows 10/11 x64, Windows PowerShell 5.1, a self-contained
.NET 8 x64 helper, and a bundled Python backend. Packaging includes the prediction
tables/policy and calls `multiprocessing.freeze_support()` before application
startup. Build steps run staged and packaged backend worker self-tests.

Neither Windows, PowerShell nor the .NET SDK was available here. Therefore setup,
PowerShell execution, PyInstaller freezing, installation/uninstallation, SAPI5,
Tobii drivers/DLL loading and physical gaze remain unverified in this review.
Dependency requirements include open version ranges; a clean Windows setup must
resolve and validate its actual installed versions. The existing build manifest
records the versions used.

On **each** Windows laptop, from a fresh checkout containing these fixes:

```powershell
.\setup.bat
.\check-windows.bat
.\python\.venv\Scripts\python.exe -m unittest discover -s python/tests -p "test_deterministic_*.py"
npm run check:word-slots
npm run check:dwell-groups
npm run check:gaze-safety
npm run check:browser-gaze-safety
npm run check:browser-cursor
.\start-dev.bat
```

After closing the development app, run `build-installer.bat`, install the produced
local-validation candidate, and run `check-windows.bat -InstalledPath "<install directory>"`
with the installed app closed. Then verify calibration, screen edges, all five dwell
groups, 100/125/150% display scaling, both keyboards, native browsing, tracker
unplug/reconnect, backend restart and application shutdown. Confirm no worker
process remains after the app exits. Record Windows version, display/scaling,
hardware/driver versions and observed failures.

Follow the existing release gates in `docs/windows-release-audit.md` before public
installer distribution. The previously untracked
`docs/deterministic-prediction-port-prompt.md` was preserved unchanged.
