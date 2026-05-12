# GazeConnect Pro

Eye-gaze controlled Augmentative and Alternative Communication (AAC) application for ALS / MND patients, built around the Tobii Eye Tracker 5. Provides dwell-based communication through an AAC board, full-screen keyboard with word prediction, phrase library, web browsing, home-design surveys, and emergency alerts. English and Hindi labels on every interactive element.

The project is open source under the MIT licence. The current build is `v4.8.0` with gaze pipeline `v17.10`.

---

## Quick start

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | <https://nodejs.org> |
| Python | 3.10+ | <https://python.org> (tick "Add to PATH" on install) |
| Git | latest | <https://git-scm.com> |
| .NET 6.0 SDK | 6.0+ | <https://dotnet.microsoft.com/download/dotnet/6.0> |
| Tobii Experience | latest | <https://gaming.tobii.com/getstarted> |

The .NET SDK and Tobii Experience are only required for hardware eye-tracker support. The app runs in simulation mode (mouse position drives the cursor) without them.

### Clone and set up

```powershell
git clone https://github.com/rishabhrd09/gazeconnect_v4.git
cd gazeconnect_v4
.\setup.bat
```

`setup.bat` installs Node packages, creates the Python virtual environment, installs all Python dependencies (gaze pipeline, word prediction, floor-plan generator: Flask, Flask-CORS, PyCairo, ezdxf, Pillow, numpy, svgwrite, onnxruntime), verifies and copies the bundled Tobii DLLs, and builds the .NET helper.

### Run

```powershell
.\start-dev.bat            # with eye tracker
.\start-dev.bat --simulate # without eye tracker (mouse simulates gaze)
```

### Build a Windows installer

```powershell
.\build-installer.bat
```

Produces a standalone `.exe` installer under `release/`. End users only need Windows 10 / 11 x64.

---

## Architecture

Five processes, three protocol boundaries, one user.

```
+-------------------+   USB raw   +--------------------+   TCP 5555   +-------------------+
| Tobii ET5 sensor  | ----------> | TobiiGazeHelper    | -----------> | Python backend    |
| 33 Hz steady      |             | (.NET 6.0, C#)     |              | asyncio pipeline  |
+-------------------+             | Tobii SDK bridge   |              | filter + classify |
                                  +--------------------+              | + magnetism       |
                                                                      +---------+---------+
                                                                                | WS 8765
                                                                                v
        +---------------------+   Chromium IPC   +---------------------+   gaze samples
        | Electron main       | <--------------> | React renderer      | <---------------+
        | BrowserView, native |                  | dwell state machine |                 |
        | mouse synthesis     |                  | cursor, screens, UI |
        +---------------------+                  +---------------------+
```

### Tech stack

| Layer | Technology | Role |
|---|---|---|
| Desktop shell | Electron 28 | Native window, system tray, single instance, BrowserView for web embedding |
| Renderer | React 18 + TypeScript 5.3 | All UI, dwell state machine, cursor rendering |
| Build | Vite 5 | Dev server and production bundling |
| Backend | Python 3.10+ (asyncio) | WebSocket server, gaze pipeline, prediction, TTS |
| Eye tracking bridge | .NET 6.0 | Tobii Stream Engine SDK wrapper |
| Gaze stabilisation | One Euro filter + OptiKey 4-zone + Kalman | See `python/services/one_euro_filter.py` |
| Event detection | I-VT classifier with hysteresis | See `python/services/gaze_classifier.py` |
| Word prediction | N-gram + smart bigrams + CIFG-LSTM neural fusion | 50-59% keystroke saving on typical English |
| TTS | pyttsx3 (Windows SAPI5) | Speech output |

### Gaze pipeline at a glance

A single gaze sample traverses, in order:

1. **TobiiGazeHelper** subscribes to the SDK's `LightlyFiltered` gaze stream and forwards each sample as one JSON line over TCP.
2. **Python pipeline** runs `SignalConditioner` (validity, blink hold, tracking-loss, frozen detection), calibration correction, `GazeClassifier` (I-VT), the OptiKey four-zone stabiliser with an adaptive Kalman filter, then `_apply_magnetism` for context-aware target attraction.
3. **WebSocket** broadcasts the result as a JSON frame including raw, post-filter, and post-magnet coordinates, plus classifier state and backend zone.
4. **React renderer** applies coordinate transform, a three-tap weighted average, semantic snap (`gazeSnapping.ts`), velocity-adaptive EMA, and the v17 R2 visual anchor (`GazeCursor.tsx`).
5. **Dwell state machine** in `GazeCursor.tsx` runs onset (250 ms) → dwell (1000 ms) → lock (10 % progress) → click. Lock-break requires both raw-gaze beyond 80 px of lock position AND outside target rect + 45 px tolerance (v17.10 fix).
6. **Telemetry** records every dwell completion with target, rect, residual, and timing. Inspect at runtime via `window.__gazeTelemetry.snapshot()` in DevTools.

For the complete walk-through with Mermaid diagrams, see [`docs/eye-tracking-pipeline-textbook.html`](docs/eye-tracking-pipeline-textbook.html).

---

## Project structure

```
gazeconnect_v4/
+- src/                                React renderer
|  +- App.tsx                          screen routing, global providers
|  +- screens/                         19 application screens (see table below)
|  +- components/
|  |  +- core/
|  |  |  +- GazeCursor.tsx             centralised dwell state machine + cursor (~1500 LOC)
|  |  |  +- GazeButton.tsx             styling + data-gaze attributes; not a dwell driver
|  |  |  +- GazeControlToggle.tsx      enable/disable + cooldown
|  |  +- GlobalNavBar.tsx              top navigation
|  |  +- settings/                     settings panels
|  +- hooks/
|  |  +- useWebSocket.tsx              backend connection + subscribeGaze
|  |  +- useGazeBrowser.ts             BrowserView IPC wrapper
|  +- contexts/                        gaze, theme, customization, alert mode, people
|  +- utils/
|  |  +- design.ts                     design tokens
|  |  +- gazeSnapping.ts               semantic snap (per-context radii)
|  |  +- hitZoneExpansion.ts           keyboard nearest-centre selection
|  |  +- gazeTelemetry.ts              dwell-event ring buffer + aggregates
|
+- electron/                           Electron main process
|  +- main.ts                          window, child-process lifecycle, IPC
|  +- preload.ts                       contextBridge surface
|  +- browser/
|     +- browserGazeController.ts      in-page cursor + Bayesian YouTube card posterior
|     +- youtubeController.ts          YouTube command scripts (skip-ad, play/pause)
|     +- browserDiagnostics.ts         BrowserView health logging
|     +- browserViewController.ts      lifecycle helper
|
+- python/                             Python backend
|  +- main.py                          asyncio entry point, WebSocket server, orchestration
|  +- prediction_guardrails.py         110-word blocklist for predictions
|  +- services/
|  |  +- signal_conditioner.py         validity, blink hold, tracking-loss, frozen detect
|  |  +- one_euro_filter.py            One Euro + GravityWell + OptiKey filter + Kalman
|  |  +- gaze_classifier.py            I-VT fixation/saccade/glissade
|  |  +- calibration.py                9-point polynomial correction
|  |  +- dwell_detector.py             backend dwell hints (auxiliary)
|  |  +- word_prediction.py            n-gram + bigrams + neural fusion
|  |  +- sentence_prediction.py        sentence completion
|  |  +- fatigue_monitor.py            20-20-20 break reminders, dry-eye monitor
|  |  +- news_service.py               news fetch for Web Hub
|  |  +- knowledge_service.py          ALS knowledge corpus
|  |  +- article_service.py            article fetch
|  |  +- quick_data_service.py         quick snapshot data
|  +- ml/
|  |  +- inference.py                  ONNX Runtime CIFG-LSTM (1.9 MB, 661 vocab)
|  |  +- fusion.py                     neural + n-gram score blending
|  +- data/
|     +- smart_bigrams.json            1,339 word-pair frequencies
|     +- gazeconnect_lm_quantized.onnx neural model
|
+- tobii-helper/                       .NET 6 Tobii bridge
|  +- TobiiGazeHelper/
|     +- Program.cs                    TCP server + gaze callback
|     +- TobiiInterop.cs               P/Invoke bindings
|     +- lib/                          bundled Tobii DLLs (machine-independent)
|
+- tools/                              floor plan generator scripts and HTTP server
+- docs/                               see "Documentation" below
+- CLAUDE.md                           project context and constraints
+- setup.bat                           first-time setup
+- start-dev.bat                       development launcher
+- build-installer.bat                 production build
+- package.json, vite.config.ts, tsconfig*.json
```

### Screens

| Screen | Purpose | Default dwell |
|---|---|---|
| Home | Navigation hub plus side actions | 600 ms |
| Keyboard | Full-screen QWERTY with word prediction | 500 ms |
| Spatial Keyboard | Larger targets for users with limited control | 700 ms |
| Phrases | Categorised phrase library | 550 ms |
| Medical | Emergency, bed / position, daily care | 400 ms (emergency) |
| Feelings | Emotion grid | 550 ms |
| Basic Needs | Water, bathroom, position, temperature | 550 ms |
| People | Family and contacts | 550 ms |
| Activities | TV, YouTube, Alexa commands | 600 ms |
| Quick Words | Quick-fire phrase overlay | 500 ms |
| Web Browsing | Embedded browser with gaze cursor and YouTube controls | 600 ms |
| Alert Mode | High-contrast caregiver alert board (auto-enables gaze on entry) | 400 ms |
| Calibration | Tobii calibration helper | n/a |
| Design Home | Home survey landing | 600 ms |
| Floor Plan Survey | Room-by-room survey | 600 ms |
| Compass Map | Direction and adjacency | 700 ms |
| Advanced Map | Compass with detailed sidebar | 700 ms |
| Customize | UI customisation | 600 ms |
| Settings | Filter presets, TTS, dwell timings | 600 ms |

---

## Floor plan generator

In-app workflow:

- `Design Home` -> `View Floor Plans` tile, or
- `Compass Map` after room placement -> `Generate Floor Plan`, or
- `Floor Plan Survey` -> `Floor Plan` once enough answers are recorded.

These call `tools/floorplan_server.py` (port 5050, started lazily on the first request) which delegates to `tools/floorplan_fusion_v1.py` and `tools/gazeconnect_floorplan_v5.py`. Results render inside `FloorPlanViewerModal` with PNG / PDF / SVG download.

Survey and compass data are session-scoped under `survey_data/sessions/<session_id>/*.json` so compass data from one session never mixes with a survey from another.

Manual server fallback (rarely needed):

```powershell
.\python\.venv\Scripts\python.exe tools\floorplan_server.py
```

CLI smoke tests:

```powershell
.\python\.venv\Scripts\python.exe tools\gazeconnect_floorplan_v5.py --sample --all-styles -o output\floorplan_v5_smoke
.\python\.venv\Scripts\python.exe tools\gazeconnect_floorplan_v5.py --latest --all-styles --dxf -o output\floorplan_v5_latest
```

Detailed references: [`home_plan_readme.md`](home_plan_readme.md), [`docs/home-planning-end-to-end-guide.md`](docs/home-planning-end-to-end-guide.md), [`docs/floorplan-end-user-guide.md`](docs/floorplan-end-user-guide.md), [`docs/latest-script-quick-start.md`](docs/latest-script-quick-start.md).

---

## Design constraints

These are non-negotiable for ALS accessibility. Anything that violates them breaks the app for its target users.

1. All UI must work with eye gaze. Dwell-based selection only. No drag-and-drop, no hover menus, no right-click required for primary flows.
2. Minimum button size is 80 px (approximately 2 degrees of visual angle at 60 cm viewing distance).
3. Layouts must work on 13" to 27" displays. Use `clamp(min, preferred, max)` and viewport units. Avoid fixed pixel dimensions for layout.
4. No scrolling on primary screens. `overflow: hidden` is intentional.
5. Dark theme is primary (`#0D1117` background, `#2DD4BF` accent). Reduces eye strain in long sessions.
6. WCAG 2.1 AA contrast (4.5:1 for text, 3:1 for UI surfaces).
7. Emergency surfaces are always accessible. Alert Mode and SOS targets use a 400 ms dwell.
8. Bilingual: every interactive label exists in English and Hindi.

---

## Documentation

| Document | What it covers |
|---|---|
| [`docs/eye-tracking-pipeline-textbook.html`](docs/eye-tracking-pipeline-textbook.html) | End-to-end gaze pipeline reference (v17.10) with Mermaid diagrams. The technical canon for the eye-tracking subsystem. |
| [`docs/gazeconnect-codebase-textbook.html`](docs/gazeconnect-codebase-textbook.html) | Full-stack codebase tour: frontend, backend, devops, data layer. |
| [`docs/developer-onboarding-guide.md`](docs/developer-onboarding-guide.md) | Environment setup, workflow, batch scripts, troubleshooting. |
| [`docs/technical-architecture-guide.md`](docs/technical-architecture-guide.md) | Concise architecture overview, IPC protocols, component hierarchy. |
| [`docs/eye-gaze-pipeline-learning-guide.md`](docs/eye-gaze-pipeline-learning-guide.md) | Narrative learning material on the gaze pipeline plus v17.x supplement. |
| [`docs/gaze-accuracy-and-word-prediction-guide.md`](docs/gaze-accuracy-and-word-prediction-guide.md) | Gaze accuracy layers paired with word-prediction internals; full v17.x change history. |
| [`docs/word-prediction-system-complete-guide.md`](docs/word-prediction-system-complete-guide.md) | Word and sentence prediction reference. |
| [`docs/NEURAL_LANGUAGE_MODEL_COMPLETE_GUIDE.md`](docs/NEURAL_LANGUAGE_MODEL_COMPLETE_GUIDE.md) | Neural model (CIFG-LSTM) internals. |
| [`docs/PREDICTION_SYSTEM_EXPLAINED.md`](docs/PREDICTION_SYSTEM_EXPLAINED.md) | Plain-language prediction explainer. |
| [`docs/build-and-installation-guide.md`](docs/build-and-installation-guide.md) | Production build, PyInstaller, electron-builder, distribution. |
| [`docs/homedesign.md`](docs/homedesign.md) | Home Design module spec. |
| [`docs/home-planning-end-to-end-guide.md`](docs/home-planning-end-to-end-guide.md) | Survey → Compass → Generate workflow. |
| [`docs/latest-script-quick-start.md`](docs/latest-script-quick-start.md) | Session-safe script commands for floor plan generation. |
| [`docs/floorplan-end-user-guide.md`](docs/floorplan-end-user-guide.md) | Installed-app floor plan workflow (no CLI required). |
| [`docs/color-system-research.md`](docs/color-system-research.md) | Colour palette research and rationale. |
| [`CLAUDE.md`](CLAUDE.md) | Project context for Claude Code sessions; design constraints. |

---

## Tobii Eye Tracker 5

The Tobii ET5 is a consumer-grade peripheral marketed for gaming and Windows Hello. It is not the same tier as Tobii Dynavox PCEye 5 or Tobii Pro Nano. The hardware exposes a `LightlyFiltered` gaze stream at 33 Hz steady state with momentary peaks to 133 Hz under good tracking. Tobii does not publish a centre / mid / corner accuracy map for this device; in clinical use on a 23" 1080p display at 60 cm we observe a noise envelope of roughly 10-20 px near screen centre and 50-100 px in corners.

### Simulation mode

`start-dev.bat --simulate` bypasses the Tobii helper entirely. The backend generates gaze samples from the OS mouse cursor position. All UI interactions work identically. Useful for development on machines without a tracker.

### Hardware mode

1. Install Tobii Experience.
2. Calibrate inside Tobii Experience.
3. Confirm gaze tracking is active in the Tobii overlay.
4. Run `start-dev.bat`.

### Tobii DLL handling

The Tobii Stream Engine DLLs are vendored under `tobii-helper/TobiiGazeHelper/lib/` and referenced from there with relative paths. No hardcoded system paths. The project builds on any Windows machine regardless of where the user has installed Tobii Experience.

To refresh the vendored DLLs from a freshly installed Tobii setup:

```powershell
.\copy-tobii-dlls.bat
```

---

## Notes on distribution

- Redistributing Tobii's runtime DLLs may require a licensing agreement with Tobii. Verify against [Tobii's developer terms](https://developer.tobii.com/) before public distribution.
- The app uses TCP port 5555 (Tobii helper) and WebSocket port 8765 (Python backend). Both have port-conflict fallback handling.
- Single-instance enforcement is built in. Launching the app while it is already running brings the existing window to the foreground.

---

## Licence

MIT Licence. See [`LICENSE`](LICENSE) for details.
