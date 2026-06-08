# Developer Onboarding Guide

This guide covers everything needed to set up a development environment, understand the project workflow, and start contributing to GazeConnect Pro.

---

## Prerequisites

Install the following before cloning:

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Node.js** | 18+ | Electron + React frontend | https://nodejs.org |
| **Python** | 3.10+ | Backend server | https://python.org (check "Add to PATH") |
| **Git** | Latest | Version control | https://git-scm.com |
| **.NET 6.0 SDK** | 6.0+ | Tobii eye tracker bridge | https://dotnet.microsoft.com/download/dotnet/6.0 |
| **Tobii Experience** | Latest | Eye tracker drivers | https://gaming.tobii.com/getstarted |

.NET SDK and Tobii Experience are only required for hardware eye tracking. You can develop and test the full UI using mouse simulation mode.

---

## Clone & Setup

```powershell
git clone https://github.com/rishabhrd09/gazeconnect_v4.git
cd gazeconnect_v4
.\setup.bat
```

`setup.bat` performs the following:
1. Installs Node.js packages (`npm install`)
2. Creates a Python virtual environment (`python/.venv/`)
3. Installs Python dependencies from `python/requirements.txt`
4. Verifies and copies Tobii DLLs into `tobii-helper/TobiiGazeHelper/lib/`
5. Builds the .NET TobiiGazeHelper project

If any step fails, the script prints a clear error message. Fix the issue and re-run `setup.bat`.

---

## Batch Scripts Reference

Every script is in the project root and designed to be run from PowerShell or CMD.

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `setup.bat` | First-time environment setup | Once after cloning, or after pulling major changes |
| `start-dev.bat` | Launch the full app (Electron + Python + Tobii) | Every development session |
| `start-dev.bat --simulate` | Launch without eye tracker (mouse-as-gaze) | Development without Tobii hardware |
| `clean.bat` | Delete build artifacts (`dist/`, `release/`, `python-dist/`, `tobii-dist/`, `node_modules/`, `.venv/`) | Before a fresh setup or when builds are broken |
| `copy-tobii-dlls.bat` | Copy Tobii DLLs from your system's NuGet cache into `tobii-helper/TobiiGazeHelper/lib/` | After updating Tobii Experience or on a new machine |
| `build-installer.bat` | Build the production `.exe` installer | When creating a distributable release |

### Recommended order for a fresh machine:

```
clean.bat  ->  setup.bat  ->  start-dev.bat --simulate
```

---

## Development Workflow

### Running in Development

**UI-only mode** (fastest iteration, no Python/Tobii):
```powershell
npm run dev
```
Opens Vite dev server at `http://localhost:5173`. Hot module replacement is active. Eye tracking and TTS will not work in this mode.

**Full app mode** (Electron + Python backend + Tobii helper):
```powershell
.\start-dev.bat --simulate
```
This launches all three processes. Use `--simulate` to use mouse cursor as gaze input.

### What each process does

| Process | Started By | Port | Purpose |
|---------|-----------|------|---------|
| Vite dev server | `npm run dev` (via start-dev.bat) | 5173 | Serves React UI with HMR |
| Electron | `electron .` (via start-dev.bat) | - | Native window, manages Python and Tobii lifecycle |
| Python backend | `python main.py` (via Electron) | 8765 (WebSocket) | Gaze filtering, word prediction, TTS, survey data |
| TobiiGazeHelper | `TobiiGazeHelper.exe` (via Electron) | 5555 (TCP) | Reads raw gaze data from Tobii hardware |

### File change workflow

1. **React/TypeScript changes** (`src/`): Saved automatically via Vite HMR. No restart needed.
2. **Python changes** (`python/`): Restart the app (`Ctrl+C` then `.\start-dev.bat --simulate`).
3. **Electron changes** (`electron/`): Restart the app.
4. **.NET changes** (`tobii-helper/`): Rebuild with `dotnet build` in `tobii-helper/TobiiGazeHelper/`, then restart.

---

## Branch Naming Conventions

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New functionality | `feature/compass-map-screen` |
| `bugfix/` | Bug fixes | `bugfix/dwell-timing-overlap` |
| `hotfix/` | Urgent production fixes | `hotfix/emergency-button-crash` |
| `docs/` | Documentation changes | `docs/update-readme` |
| `refactor/` | Code restructuring | `refactor/settings-panel` |

---

## Key Files to Know

| File | What It Does |
|------|-------------|
| `src/App.tsx` | Root component. Contains screen routing and global context providers. |
| `src/components/core/GazeButton.tsx` | Canonical React gaze button. Owns button-level hover/dwell visuals, reads tunable `dwellCategory` values, emits `data-gaze*` metadata, and enforces the 80px AAC target floor. |
| `src/components/core/GazeCursor.tsx` | Global renderer cursor and external dwell path for raw `data-gaze` targets such as shared chrome. Owns visual anchoring, sticky hit testing, saved-dwell continuity, and telemetry. Do not add custom rAF dwell loops on top of it. |
| `src/components/core/GazeControlToggle.tsx` | Gaze enable/disable state + cooldown timing. Provides the `useGazeControl` hook. |
| `src/components/GlobalNavBar.tsx` | Top navigation bar present on every screen. |
| `src/utils/design.ts` | All design tokens: colors, spacing, typography, screen themes. |
| `src/utils/gazeSnapping.ts` | Semantic snap — soft attraction toward gaze-enabled buttons. Per-context radii/strengths + the v17 near-center proximity boost. |
| `src/utils/hitZoneExpansion.ts` | Center-weighted nearest-key selection for the keyboard. `KEYBOARD_SNAP_MARGIN = 55 px` (v17.8). |
| `src/utils/gazeTelemetry.ts` | **R1 telemetry module (v17).** Records every dwell-click event with residual, drift vector, acquisition time. Inspect via `window.__gazeTelemetry.snapshot()` in DevTools. |
| `src/hooks/useWebSocket.tsx` | WebSocket connection to the Python backend. Handles reconnection, message routing, and the `subscribeGaze` listener pattern. |
| `src/hooks/useGazeBrowser.ts` | Hook wrapping all IPC for the embedded `BrowserView` (open / close / updateGaze / youtubeCommand / playbackState / setGazeConfig / telemetry / page links). |
| `electron/main.ts` | Electron main process. Creates the window, spawns Python and Tobii processes, handles IPC. Owns the `BrowserView` for embedded web browsing. |
| `electron/browser/browserGazeController.ts` | Injected IIFE that runs the in-page dwell cursor inside `BrowserView`. Includes v17.15 Bayesian YouTube card posterior, thumbnail/title snap rects, in-video dwell suppression, playback snapshots, and true-fullscreen auto-exit. |
| `electron/browser/youtubeController.ts` | YouTube-specific command script builder. Handles play/pause, next, skip-ad, show/hide controls, volume up/down, and state readback. |
| `python/main.py` | Python entry point. Asyncio WebSocket server handling gaze data, word + sentence prediction, Datamuse API, TTS, survey persistence. Hosts `_apply_magnetism` (per-context magnetism) and the OptiKey pipeline orchestration. |
| `python/services/signal_conditioner.py` | Validity / blink hold / tracking-loss / frozen detection. |
| `python/services/one_euro_filter.py` | One Euro filter + OptiKey 4-zone stabilizer + GravityWell magnetism. |
| `python/services/gaze_classifier.py` | I-VT fixation/saccade/glissade classifier (65 / 150 °/s thresholds with 2-of-N / 4-of-N hysteresis). |
| `python/services/word_prediction.py` | Word prediction engine: n-gram model, smart bigrams (1,339 pairs), CIFG-LSTM neural fusion (1.9MB), vocabulary boosting, RecencyTracker, PatientBigramTracker, time-of-day boost. |
| `python/prediction_guardrails.py` | Blocked words filter: 110 harmful/inappropriate words permanently filtered from predictions. |
| `python/services/sentence_prediction.py` | Sentence completion engine: patient history, 180 templates, fuzzy matching. |
| `python/data/smart_bigrams.json` | Pre-computed word-pair frequencies (36KB, loaded at startup). |
| `python/ml/inference.py` | CIFG-LSTM neural predictor (ONNX Runtime, 30ms timeout). |
| `CLAUDE.md` | Claude Code project context. Contains constraints and rules for AI-assisted development. |

---

## Gaze Pipeline Docs Map

For understanding the eye-tracking pipeline (the system's heart), read in this order:

1. `docs/eye-tracking-pipeline-textbook.html` — **comprehensive technical reference** (v17.10). Open in a browser. Covers Tobii hardware → C# bridge → Python pipeline → WebSocket transport → Electron main → React renderer → dwell state machine → BrowserView pipeline → telemetry. Includes Mermaid flow diagrams and end-to-end frame trace.
2. `docs/eye-gaze-pipeline-learning-guide.md` — narrative learning material covering the design choices, with a v17.x supplement.
3. `docs/gaze-accuracy-and-word-prediction-guide.md` — joins gaze accuracy with word prediction. Part 4 has the full v17.x change history.
4. `docs/technical-architecture-guide.md` — concise architecture overview with the 5-layer process model.
5. `CLAUDE.md` — non-negotiable design constraints for any change to the gaze pipeline.

## Floor Plan Docs Map

Use these in this order:

1. `docs/floorplan-end-user-guide.md`
   - Installed-app user flow (no CLI).
2. `docs/home-planning-end-to-end-guide.md`
   - Survey/Compass save model + app generation path.
3. `docs/latest-script-quick-start.md`
   - All script commands (`v4`, `smart`, `v5`) with session-safe usage.
4. `home_plan_readme.md`
   - Compact technical summary of floor-plan module wiring.

## Word Prediction Docs Map

1. `docs/word-prediction-system-complete-guide.md` — the canonical word-prediction reference.
2. `docs/NEURAL_LANGUAGE_MODEL_COMPLETE_GUIDE.md` — deep dive on the CIFG-LSTM neural predictor.
3. `docs/PREDICTION_SYSTEM_EXPLAINED.md` — plain-language explainer.
4. `docs/gaze-accuracy-and-word-prediction-guide.md` Part 2 — how predictions flow into the keyboard UI.

---

## Design Constraints

These constraints are critical for ALS accessibility. Violating them breaks the app for its target users.

1. **All UI must work with eye-gaze**. Dwell-based selection only. No drag/drop, no hover menus, no right-click.
2. **Minimum button size: 80px** (2 degree visual angle at 60cm viewing distance).
3. **Responsive: 13" to 27" screens**. Use `clamp(min, preferred, max)` and viewport units. Never use fixed `px` for layout dimensions.
4. **No scrolling on main screens**. Everything must fit within the viewport. `overflow: hidden` is intentional.
5. **Dark mode is primary**. Background: `#0D1117`, accent: `#2DD4BF`.
6. **Emergency buttons must always be accessible** with 400ms dwell time.
7. **Never break the tested 23" (1920x1080) layout**. Only add support for smaller screens.

---

## Current Feature Standards

Use this section before adding any new screen, toolbar, modal, or embedded-browser feature.

### React screens

- Prefer `GazeButton` for patient-facing controls.
- Use `dwellCategory="..."`; avoid raw `dwellTime={...}` except for a documented safety exception.
- Keep gaze targets at or above 80px on the shorter axis.
- Avoid hover/selection transforms that move geometry. Color/fill changes are safer than scale.
- Keep main screens non-scrollable. If content cannot fit at 1366x768, use paging or fewer active items.
- Keep emergency and gaze-toggle recovery controls reachable after navigation.

### Dwell architecture

The app has multiple gaze paths by design:

- React AAC controls: `GazeButton`.
- Shared/raw chrome: `GazeCursor` reading `data-gaze*` metadata.
- Embedded BrowserView content: injected cursor from `electron/browser/browserGazeController.ts`.

Do not stack a new `requestAnimationFrame` dwell loop or custom progress bar on the same target as one of these systems. A single target should have one dwell owner.

### Embedded browser / YouTube

- BrowserView page content is not part of the React DOM. App overlays do not reliably sit above it; put patient controls in React regions outside the BrowserView.
- Current YouTube controls are the top toolbar plus the right side dock. There is intentionally no bottom rail.
- The side-dock **Full Screen** button is an in-app video maximize only. It must not enter true browser fullscreen.
- True fullscreen is auto-exited by the injected script because it hides gaze-accessible recovery controls.
- While a video is playing, dwell inside the video rect is suppressed. Controls outside the video rect must remain usable.
- Quick Search / page-link actions should prefer the large app-owned link sidebar over tiny native web links.

### Compass Map

Compass Map is a direct-work placement screen. It opens with navigation hidden and gaze enabled so room placement can begin immediately. Preserve that behavior unless a clinician explicitly asks for a different entry flow.

### Protected validated surfaces

Treat these as high-risk files. Do not modify them for unrelated feature work:

- `src/screens/KeyboardScreen.tsx`
- `src/components/core/GazeButton.tsx`
- `src/components/core/GazeCursor.tsx`
- `src/config/dwellTimeConfig.ts`

Only change them for a verified high-severity bug, and smoke-test keyboard typing immediately after.

---

## Testing

### Manual testing checklist

- [ ] All screens load without errors
- [ ] GazeButton dwell activation works (hover for dwell duration)
- [ ] Emergency buttons respond at 400ms
- [ ] Word prediction returns suggestions on the keyboard screen
- [ ] Sentence predictions appear in the bottom row when typing common phrases (e.g., "I want")
- [ ] Selecting a sentence prediction fills the text area and learns the sentence
- [ ] TTS speaks selected phrases
- [ ] Navigation between all screens works via GlobalNavBar and Home tiles
- [ ] Content fits within viewport without scrolling (test at 1920x1080 and 1366x768)
- [ ] Web Browsing: YouTube in-video dwell suppresses accidental play/pause, side-dock Full Screen keeps app controls visible, and Quick Search link cards are 80px+ targets
- [ ] Compass Map opens with gaze enabled and nav hidden for immediate placement

### Simulation mode testing

Run `.\start-dev.bat --simulate` and use your mouse cursor as gaze input. This tests the full pipeline except the Tobii hardware layer.

### Type and diff checks

Run these before handing code to a tester:

```powershell
node --max-old-space-size=4096 .\node_modules\typescript\bin\tsc --noEmit
node --max-old-space-size=4096 .\node_modules\typescript\bin\tsc -p tsconfig.electron.json
git diff --check
git diff --stat -- src/screens/KeyboardScreen.tsx src/components/core/GazeButton.tsx src/components/core/GazeCursor.tsx src/config/dwellTimeConfig.ts
```

The protected-file diff should be empty unless the task explicitly targeted one of those files.

---

## Troubleshooting

### "Python not found" or "pip failed"

- Ensure Python is in your PATH: `python --version`
- Re-run `setup.bat`

### "Node modules missing" or "Cannot find module"

```powershell
.\clean.bat
.\setup.bat
```

### "Port 8765 already in use"

Another instance of the Python backend is running. Kill it:
```powershell
taskkill /f /im python.exe
```
Or check Task Manager for orphaned `python.exe` processes.

### "Port 5555 already in use"

Another TobiiGazeHelper instance is running:
```powershell
taskkill /f /im TobiiGazeHelper.exe
```

### Electron window is blank

The Vite dev server may not have started yet. Wait a few seconds, or check the terminal for Vite startup output.

### Tobii DLLs missing

```powershell
.\copy-tobii-dlls.bat
```
If that fails, ensure Tobii Experience is installed and NuGet packages are restored (`dotnet restore` in `tobii-helper/TobiiGazeHelper/`).

### Windows Long Path errors during build

Copy the project to a short path like `C:\GC\` before building. Windows has a 260-character path limit that can cause failures when building deep in `Downloads` or `Documents`.
