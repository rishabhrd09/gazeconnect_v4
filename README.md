# GazeConnect Pro

A free, open-source Windows application for eye-gaze communication and everyday activities, built around **Tobii Eye Tracker 5**. It includes a keyboard with word prediction, communication boards, phrases, people, web browsing, YouTube controls, and home-design activities. The current interface is English-only.

GazeConnect is a communication aid, not a dependable emergency notification system or a certified medical device. Care phrases speak through the computer. Global emergency buttons have been removed. The separate, existing Alert Mode communication board remains available.

## Run on Windows

Target: **Windows 10 / 11, x64**. Hardware tracking has been used successfully on the maintainer's Windows 10 laptop. Each new release still needs validation on Windows with the tracker connected; a browser preview or macOS build cannot validate the drivers or installer.

For development, install Git, Node.js x64 (Node 22 is the validation baseline), Python x64 (3.12 is the validation baseline; minimum 3.10), and the latest serviced .NET 8 SDK used by the current bridge. For hardware use, install Tobii Experience and calibrate the tracker there first.

```powershell
git clone https://github.com/rishabhrd09/gazeconnect_v4.git
cd gazeconnect_v4
.\setup.bat
.\check-windows.bat
.\start-dev.bat
```

`setup.bat` prepares Node dependencies, the Python environment, and the Tobii helper. `copy-tobii-dlls.bat` refreshes helper libraries from a local Tobii installation when needed. See [bridge setup](tobii-helper/README.md).

`check-windows.bat` runs finite checks without starting gaze tracking. It checks dependencies, the prediction model, floor-plan renderer/solver, DLL inputs and required ports, and writes a report to `tools/reports/`. Close a running GazeConnect app before this check. Use `-Simulate` to omit hardware build checks. Do not copy a macOS `node_modules` or Python virtual environment to Windows; let setup create Windows dependencies.

For UI development without Windows hardware:

```sh
npm ci
npm run dev
```

The development launcher accepts `start-dev.bat --simulate`, explicitly passing mouse simulation to the backend and skipping hardware startup. Tracking loss never silently enables mouse hover selection.

## Using the application

- Enable gaze with the round gaze toggle, then look at a target until the dwell indicator completes. Mouse input also works.
- Selection uses five times, one per kind of action, chosen as a complete set in Settings → App Settings → **Selection Speed**: **Balanced** (default) 900 ms letters/keys, 1,300 ms word suggestions/alphabet groups, 1,600 ms communication, 1,900 ms navigation/choices, 2,500 ms deliberate actions; **Quick** 500 / 1,000 / 1,250 / 1,500 / 2,000 ms for a practised user; **Relaxed** 1,300 / 1,700 / 2,000 / 2,400 / 3,000 ms when selections happen too fast. There are no individual timing sliders.
- Open Keyboard, Phrases, Quick Words, or the care boards to express a message. Speech depends on the computer's voices and volume.
- Choose Balanced (default), Responsive, Steady or Gentle smoothing in Settings → App Settings. These change movement response, never the selection durations. Balanced and Responsive follow the eyes at once; Steady and Gentle wait a moment first, so a stray glance never moves the cursor. **Show Gaze Cursor** can hide the circle that follows the eyes; the highlight and dwell ring still appear on the item being looked at.
- Choose **Warm** or **Dark** in Settings → App Settings. Older Light preferences migrate to Warm; Mix preferences migrate to Dark.
- Settings is a caregiver page operated with a mouse. Use its export/import actions to back up personal phrases, people, and preferences before upgrades.
- Social & Connect currently shows “Coming soon” for Gmail, LinkedIn and WhatsApp.
- Web browsing, YouTube and news require connectivity. Core phrase communication and local prediction can work offline when their required assets are installed.

## Build an installer

Run on Windows:

```powershell
.\build-installer.bat
```

The script builds React/Electron, two frozen Python services and a self-contained .NET helper, validates staged and packaged resources, then places an NSIS installer candidate in a unique `release/` directory. Failed validation does not publish a candidate there.

After installing, run `check-windows.bat -InstalledPath "C:\path\to\GazeConnect Pro"` from this checkout to check the installed runtimes. The installed app carries Python and .NET; recipients need Tobii Experience, not development SDKs. Test installation and tracking separately on both Windows 10 and Windows 11. See the [Windows test steps](docs/windows-local-testing.md).

**Distribution still requires approval and native validation.** See the [eye-tracking engineering audit](docs/eye-tracking-engineering-audit-2026-09-14.md), [OptiKey source review](docs/optikey-gaze-reference-review.md), and [Windows release workflow](docs/windows-release-audit.md). Tobii AAC/redistribution rights, source provenance, supported runtimes, clean-machine installation and hardware performance remain release requirements. Tobii Experience remains a prerequisite.

## Architecture

```text
Tobii Eye Tracker 5
  → C# Tobii Interaction Library helper (TCP 5555)
  → Python asyncio backend (WebSocket 8765)
  → React UI / Electron desktop shell

Electron BrowserView → embedded web/YouTube gaze controls
Floor-plan service   → generated plans (started lazily on port 5050)
```

| Area | Location | Responsibility |
|---|---|---|
| UI | `src/screens/`, `src/components/` | Communication screens, navigation, dwell targets |
| Appearance | `src/utils/design.ts`, `src/refinement.css`, `src/warmmode.css` | Warm/dark colors and typography |
| Gaze interaction | `src/components/core/`, `src/utils/gazeSnapping.ts` | Cursor, selection, gaze toggle |
| Desktop | `electron/` | Native windows, child processes, IPC, embedded browser |
| Backend | `python/main.py`, `python/services/` | Signal conditioning, filtering, prediction, speech |
| Tobii bridge | `tobii-helper/TobiiGazeHelper/` | Windows SDK integration and gaze transport |
| Personalization | `src/services/CustomizationService.ts` | Phrases, people, boards, persisted settings |
| Floor plans | `tools/` | Survey/map processing and plan generation |

The current stack is Electron 28, React 18, TypeScript, Vite 5, Python and .NET 8. The active bridge uses the Tobii **Interaction Library**; the presence of Stream Engine interop files does not mean that path is active. Gaze processing combines signal conditioning, calibration/mapping, filtering and target selection. Changing one stage requires measuring the whole chain, including unintended activations and response time.

Local word prediction combines n-grams, smart bigrams, personalization and optional ONNX neural reranking. Prediction guardrails apply across output paths. Datamuse enrichment is off by default. See [prediction architecture](docs/word-prediction-system-complete-guide.md), and `python/services/word_prediction.py` for the current implementation.

## Development checks

```sh
npm run build
npm run build:electron
npm run check:browser-cursor
npm run check:dwell-groups
npm run check:gaze-safety
node scripts/check-tts-routing.js
python -m unittest discover -s python/tests
```

Use the project's Python environment for tests. Neural training tests need additional ML dependencies; missing assets/dependencies must be reported rather than counted as successful tests. `npm run lint` currently needs an ESLint configuration; TypeScript compilation is available independently.

Keep normal gaze logs off. Redirect runtime logs to a file; use `GAZE_DEBUG=1` only for focused diagnosis. Do not record or commit personal communication or gaze logs.

Contributions should preserve phrase text, board names, dwell defaults, and the tested 1920×1080 layout. Primary gaze targets should be at least 80 CSS pixels and remain stationary during hover/selection. Check 1366×768 and 1920×1080, both themes, tracking loss and reconnect. Keep the interface English-only; Hindi support is deferred to a separate task. No scrolling or drag-and-drop is intended for primary communication flows. Known pre-existing clipping and small-target cases are listed in the review plan.

## Technical references

- [Production readiness and UI refinement](docs/windows-production-and-ui-refinement-plan.md)
- [Gaze pipeline](docs/eye-tracking-pipeline-textbook.html)
- [Home-planning workflow](docs/home-planning-end-to-end-guide.md)
- [Floor-plan user guide](docs/floorplan-end-user-guide.md)

## License

Application code is distributed under the [MIT License](LICENSE). Third-party components retain their own licenses. The bundled Manrope font includes its [SIL Open Font License](src/assets/fonts/Manrope-LICENSE.txt). Verify Tobii runtime redistribution permissions before publishing a binary package. Reference-project study does not grant permission to copy differently licensed source.
