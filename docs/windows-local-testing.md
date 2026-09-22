# Test this revision on Windows 10 and Windows 11

The application targets Windows x64 with Tobii Eye Tracker 5. This revision was edited on macOS: portable tests and source review are complete, but native installation, .NET/vendor interoperability and physical tracking must be tested on your Windows laptops. Keep a copy of the previously working installer and export your settings before upgrading.

For a fresh Windows agent session, use [the complete handoff prompt](windows-handoff-prompt.md). Its current requirements supersede older audit snapshots.

## Source setup

Use a fresh Windows checkout or source copy without `node_modules`, `python/.venv`, `dist*`, `python-dist`, `tobii-dist` or .NET `bin/obj` from the Mac. Install Git, Node 22 x64, Python 3.12 x64 and the latest serviced .NET 8 SDK. Ensure `node`, `npm`, `python` and `dotnet` resolve in a new terminal. Tobii Experience must recognize/calibrate the Eye Tracker 5.

From a normal, non-administrator terminal:

```powershell
.\setup.bat
.\check-windows.bat
.\start-dev.bat
```

Paths containing spaces are supported. Scripts locate the repository from their own directory. `setup.bat` installs project dependencies, validates their imports and builds the x64 bridge. It does not install drivers. If it reports a missing vendor DLL, follow `tobii-helper/README.md`; do not substitute unrelated DLL versions.

For mouse-only testing, use `setup.bat -Simulate`, `check-windows.bat -Simulate`, then `start-dev.bat --simulate`. Hardware failure does not silently turn on mouse simulation.

The readiness check writes `tools/reports/windows-check-*.log`; the development launcher writes `tools/reports/dev-*.log`. Keep high-frequency gaze debugging off unless investigating a specific issue. An occupied port reports its owner without terminating it. Close your already-running app before rerunning the checks.

## Build and installed app

```powershell
.\build-installer.bat
# Install the newly generated .exe under release/<timestamp-id>/.
.\check-windows.bat -InstalledPath "C:\path\to\GazeConnect Pro"
```

Select the actual folder containing `GazeConnect Pro.exe`. The installed-runtime check needs this source checkout and Windows PowerShell, but no Node/Python/.NET SDK. It starts only finite dependency/model/render tests, not a gaze stream or server. It does not replace the full build's PE/resource verification.

The installer bundles the Python backend, floor-plan service and self-contained .NET helper. Do not move individual executables away from their accompanying resources. The floor-plan renderer is called through a restricted Electron-to-loopback bridge so the installed `file://` UI does not depend on development CORS settings.

## Word prediction and the ten keyboard slots

This revision makes the deterministic word predictor the default and shows ten word slots on the traditional keyboard. See [the prediction README](deterministic-prediction/README.md). No new Python or npm dependencies were added, so an existing setup only needs the new commits.

1. **Tests.** Run these after `setup.bat`:

   ```powershell
   python\.venv\Scripts\python.exe -m unittest discover -s python\tests -p "test_deterministic_*.py"
   python\.venv\Scripts\python.exe -m unittest discover -s python\tests -p "test_prediction_pipeline.py"
   npm run check:word-slots
   .\check-windows.bat -Simulate
   ```

   The first command replays the reference parity fixture and spawns real prediction workers on Windows. `check-windows.bat` runs the backend `--self-test`, which now answers one prediction inline and one through the worker process.

2. **Mouse run.** Start `.\start-dev.bat --simulate`, open Keyboard and type `i need wa`.
   - Expect ten distinct words starting with `wa`, five per row, with a phrase such as `I need water` in the top-right cell.
   - A fresh profile shows `water wasn't warm want wait` on top and `was walk watch wake way` below. Learned history migrated from the old engine can reorder them.
   - Select `water`: the message reads `i need water ` exactly once.
   - Press Word delete: it returns to `i need ` and undoes the learning.
   - Toggle SHOW NAV and full screen, and switch between Warm and Dark. Both word rows stay visible with nothing overlapping.

3. **Processes.** Task Manager shows a second backend Python process: the prediction worker, about 100 MB. Close the app. Both backend processes must exit, including after ending the backend from Task Manager.

4. **Reconnect.** With the keyboard open, close the backend (or let it restart). The slots dim, and after reconnecting they return for the current draft without typing.

5. **Gaze run.** Start `.\start-dev.bat` with the Tobii Eye Tracker 5.
   - Every slot and the phrase cell select with the 1000 ms Words dwell.
   - A word that changes while you look at it restarts its dwell.
   - Slots 1, 5, 6 and 10 are reachable at your normal scaling.

6. **Rollback.** Close the app, run `set GAZECONNECT_PREDICTION_ENGINE=legacy` in the same terminal, then `.\start-dev.bat --simulate`. The keyboard now shows the previous engine's words. Close the app and run `set GAZECONNECT_PREDICTION_ENGINE=` to return to the default.

7. **Installer.** `.\build-installer.bat` runs the frozen self-test, including the prediction worker, staged and from `win-unpacked`. After installing, run `.\check-windows.bat -InstalledPath "C:\path\to\GazeConnect Pro"`.

## Acceptance on each laptop

Record the OS build, display resolution/scaling, Tobii Experience version and exact installer hash with results:

- Start with the tracker connected; verify calibration, gaze on/off and large-target selection. Unplug/replug, leave/return and sleep/resume; stale samples must not select anything.
- The app starts maximised; right-click → Full Screen Mode toggles full screen once it is up (`set GAZECONNECT_START_FULLSCREEN=1` before launching requests it automatically after the splash — unverified on hardware; an earlier attempt that requested it during the splash hung the app, so check that gaze works and the app responds after it switches). In full screen, along each screen edge, hold a bottom-row and a top-row control through a full dwell: it must not break when the tracker reports gaze slightly off the glass, and looking well away from the screen must still stop everything. While the app runs, `python\.venv\Scripts\python.exe tools\gaze_live_observer.py --seconds 90` records a read-only summary (sample rate, loss reasons by region, how far outside the rejected samples fell, the interface's own delivery/paint times) under `tools\reports\`; it never sends anything to the app. `set GAZE_HELPER_STREAM=lightly_filtered` returns to Tobii's smoothed stream for comparison.
- Try Zone Board in Warm/Dark: all five groups, every letter, Delete, Space, six suggestions, Speak, full-screen toggle and Quick Phrases → choose phrase → return. The message must survive the round trip. There is no word-length question. Selection times come from the set chosen in Settings → Selection Speed: Balanced (default) is 900ms for letters/keys, 1300ms for suggestions/alphabet groups, 1600ms for communication, 1900ms for navigation/choices and 2500ms for deliberate actions; Quick is 500/1000/1250/1500/2000ms and Relaxed is 1300/1700/2000/2400/3000ms. The separate zone-entry buffer remains; these are dwell durations, not total time since entering a screen.
- Try keyboard/communication boards, news/YouTube/Quick Search and a full survey → Compass → floor-plan generation/export. Gmail, LinkedIn and WhatsApp intentionally show “Coming soon”.
- Test 1366×768 and 1920×1080 and your normal Windows scaling. Test install/upgrade/uninstall with a standard user, and an installed app on a machine without developer runtimes.

A passing Mac build or hosted Windows Server CI run is not proof of Windows 10/11 hardware performance. [PyInstaller requires building on the target OS](https://www.pyinstaller.org/en/stable/). Microsoft distinguishes OS compatibility from servicing support; see its [.NET Windows platform guidance](https://learn.microsoft.com/en-us/dotnet/core/install/windows). Native results remain to be recorded here before declaring this revision validated for distribution.

## Checks completed on this development host

- Frontend and Electron TypeScript/production builds passed. Vite still reports the existing large-main-chunk warning.
- Zone Board: 13 text/completion tests, all 26 letter selections and the Quick Phrases return flow passed. All 24 overview/letter-group views fit 1366×768 and 1920×1080 in Warm/Dark with targets at least 80 CSS pixels. Browser full-screen enter/exit was checked.
- Startup readiness: 7 failure/timeout checks. Floor-plan bridge: 10 checks including allowed local requests and rejected arbitrary routes/bodies. Bundle validator: 9 failure cases; current vendor PE/static-asset inspection passed.
- Latest timing follow-up: 11 fixed-duration/preference checks, 10 gaze-safety checks, 24 browser request/native-click safety checks and 19 browser replay scenarios passed. The five durations above are wired into selection logic.
- Latest keyboard layout follow-up: 32 traditional-keyboard states and 24 Zone Board states were checked across Warm/Dark and 1024×768, 1280×720, 1366×768 and 1920×1080. No measured button overlaps, off-screen targets or targets below 80 CSS pixels were found in that matrix. This is not a claim about every screen/state or physical display scaling.
- English-only and food-content regressions passed in earlier checks.
- PowerShell/.NET execution, Windows dependency installation/freezing, installed file-origin rendering and physical Tobii behavior cannot be run on this Mac. The Windows workflow now includes the new finite checks; it has not been dispatched from this working tree.
