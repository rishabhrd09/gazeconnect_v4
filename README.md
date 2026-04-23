# GazeConnect Pro

## Eye-Gaze AAC Application for ALS/MND Patients

GazeConnect Pro is a free, open-source communication application for ALS/MND patients using the **Tobii Eye Tracker 5**. It provides eye-gaze controlled communication through an AAC board, full-screen keyboard, phrase library, and emergency alerts with bilingual **English/Hindi** support.

---

## Quick Start

### Prerequisites

| Tool | Version | Install Link |
|------|---------|-------------|
| **Node.js** | 18+ | https://nodejs.org |
| **Python** | 3.10+ | https://python.org (check "Add to PATH") |
| **Git** | Latest | https://git-scm.com |
| **.NET 6.0 SDK** | 6.0+ | https://dotnet.microsoft.com/download/dotnet/6.0 |
| **Tobii Experience** | Latest | https://gaming.tobii.com/getstarted |

> .NET SDK and Tobii Experience are only needed for hardware eye tracker support. The app works in simulation mode (mouse-as-gaze) without them.

### Clone & Setup

```powershell
git clone https://github.com/rishabhrd09/gazeconnect_v3.git
cd gazeconnect_v3
.\setup.bat
```

The setup script installs Node.js packages, creates the Python virtual environment, installs all Python dependencies (core backend + floor plan generator: Flask, Flask-CORS, PyCairo, ezdxf, Pillow, numpy, svgwrite), verifies/copies Tobii DLLs, and builds the .NET Tobii helper.

### Run the App

**With Eye Tracker (hardware mode):**
```powershell
.\start-dev.bat
```

**Without Eye Tracker (mouse simulation):**
```powershell
.\start-dev.bat --simulate
```

### Build Distributable Installer

```powershell
.\build-installer.bat
```

Creates a standalone Windows installer in `release/` that includes everything. Users only need Windows 10/11 x64.

---

## Floor Plan Generator (Integrated)

### Dependency Handling

No extra manual `pip install` is required if you run:

```powershell
.\setup.bat
```

`setup.bat` installs and verifies all floor plan dependencies inside `python\.venv`.

### Session-Safe Data Model (Important)

Planning saves are session-scoped:
- `survey_data/sessions/<session_id>/*.json`
- `survey_data/session_index.json`

Each save includes:
- `session_id`
- `save_seq`
- `save_id`
- `timestamp`

This prevents accidental mixing of compass data from one run with survey data from another.

### Floor Plan API Startup

When you run `.\start-dev.bat`, Electron auto-starts:
- core Python backend (`python/main.py`)

The floor plan API server (`tools/floorplan_server.py`, port `5050`) starts lazily on first floor-plan request from the UI.

Manual fallback (only if needed):

```powershell
.\python\.venv\Scripts\python.exe tools\floorplan_server.py
```

### Command-Line Smoke Tests (Optional)

From project root:

```powershell
.\python\.venv\Scripts\python.exe tools\gazeconnect_floorplan_v5.py --sample --all-styles -o output\floorplan_v5_smoke
.\python\.venv\Scripts\python.exe tools\gazeconnect_floorplan_v5.py --latest --all-styles --dxf -o output\floorplan_v5_latest
```

### UI Buttons That Trigger Generation

- `DesignHomeLandingScreen`: **View Floor Plans** tile
- `CompassMapScreen`: **GENERATE FLOOR PLAN** button in sidebar (appears after room placement)
- `CompassMapScreen` review: **GENERATE FLOOR PLAN** button on floor transition
- `FloorPlanSurveyScreen`: **FLOOR PLAN** button (appears after enough answers)

These buttons call the Python renderer via the Flask API and display results in `FloorPlanViewerModal` with style switching and PNG/PDF/SVG download.

### Where In-App Generated Files Are Stored

In-app generation uses temporary files:
- `%TEMP%\gazeconnect_floorplans`

So `output/` may stay empty unless you:
- click download in the UI, or
- run standalone scripts with `-o output\...`.

### Which Path Is Production-Stable Today

The in-app "Generate Floor Plan" button uses this production path:
- `tools/floorplan_server.py` (`/api/floorplan/generate-advanced`)
- `tools/floorplan_fusion_v1.py` (survey + compass + notes fusion)
- `tools/gazeconnect_floorplan_v5.py` (`parse()` + `CairoFloorPlan`)

### Output Fidelity Matrix

- **`/api/floorplan/generate-advanced` (app default)**:
  - Best for production use and current Compass map flow.
- **`/api/floorplan/v5/generate` (optional endpoint)**:
  - Optional optimization path for advanced layouts/experiments.

Detailed references:
- `home_plan_readme.md`
- `docs/home-planning-end-to-end-guide.md`
- `docs/latest-script-quick-start.md`
- `docs/floorplan-end-user-guide.md`

---

## Architecture

```
Tobii Eye Tracker 5 (USB, 133Hz)
         |
         v
+--------------------+    TCP:5555    +------------------+    WS:8765    +------------------+
| TobiiGazeHelper    | ------------> | Python Backend   | ------------> | Electron App     |
| (.NET 6.0)         |               | (asyncio)        |               | (React + TS)     |
| Tobii.Interaction  |               | One Euro Filter  |               | Dwell Detection  |
+--------------------+               | Word Prediction  |               | TTS Output       |
                                     | Fatigue Monitor  |               | AAC Boards       |
                                     +------------------+               +------------------+
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop | Electron 28 | Native window, system tray, single instance |
| Frontend | React 18 + TypeScript | UI components, screens, gaze cursor |
| Build | Vite 5 | Dev server + production bundling |
| Backend | Python 3.10+ (asyncio) | WebSocket server, computational services |
| Eye Tracking | .NET 6.0 (TobiiGazeHelper) | Tobii Eye Tracker 5 SDK bridge |
| TTS | pyttsx3 (SAPI5) | Text-to-speech for patient communication |
| Stabilization | One Euro Filter | Gaze point smoothing |
| Prediction | N-gram + frequency model | Word prediction (50-59% keystroke saving) |

---

## Project Structure

```
gazeconnect_v3/
├── src/                              # React frontend
│   ├── App.tsx                       # Root component with screen routing
│   ├── screens/                      # All 16 app screens
│   │   ├── HomeScreen.tsx            # Navigation hub (9 tiles + sidebar actions)
│   │   ├── AABoardScreen.tsx         # AAC communication board (8 categories)
│   │   ├── KeyboardScreen.tsx        # Full-screen gaze keyboard
│   │   ├── SpatialKeyboardScreen.tsx # Spatial keyboard for limited control
│   │   ├── PhrasesScreen.tsx         # Categorized phrase library
│   │   ├── MedicalScreen.tsx         # Emergency & medical phrases
│   │   ├── FeelingScreen.tsx         # Emotions/feelings board
│   │   ├── BasicNeedsScreen.tsx      # Daily needs board
│   │   ├── PeopleScreen.tsx          # Family & contacts
│   │   ├── ActivitiesScreen.tsx      # TV, YouTube, Alexa
│   │   ├── WebBrowsingScreen.tsx     # Web browsing interface
│   │   ├── FloorPlanSurveyScreen.tsx # GazePlan home design survey
│   │   ├── DesignHomeLandingScreen.tsx # Design Home entry point
│   │   ├── CompassMapScreen.tsx      # Compass/direction selector
│   │   ├── CustomizeScreen.tsx       # Customization interface
│   │   └── SettingsScreen.tsx        # App configuration
│   ├── components/                   # Shared components
│   │   ├── core/GazeButton.tsx       # Dwell-aware button (primary interaction)
│   │   ├── core/GazeCursor.tsx       # Visual gaze cursor overlay
│   │   ├── core/GazeControlToggle.tsx # Enable/disable gaze hook
│   │   ├── GlobalNavBar.tsx          # Top navigation bar
│   │   ├── QuickFires.tsx            # Quick response bar
│   │   ├── icons/Icons.tsx           # SVG icon components
│   │   └── settings/                 # Settings panel components
│   ├── hooks/
│   │   ├── useWebSocket.tsx          # Python backend connection
│   │   └── useSettings.ts            # Settings persistence
│   ├── contexts/
│   │   ├── RealGazeContext.tsx        # Gaze data context
│   │   ├── DwellTimeContext.tsx       # Dwell timing context
│   │   ├── CustomizationContext.tsx   # UI customization context
│   │   └── PeopleContext.tsx          # Contacts data context
│   └── utils/
│       ├── design.ts                 # Design tokens & constants
│       ├── responsive.ts             # Responsive sizing utilities
│       └── surveyDefaults.ts         # Survey default data
│
├── electron/                         # Electron main process
│   ├── main.ts                       # Window, Python & Tobii lifecycle
│   └── preload.ts                    # Secure IPC bridge
│
├── python/                           # Python backend
│   ├── main.py                       # Entry point + WebSocket server
│   ├── requirements.txt              # Dependencies
│   └── services/
│       ├── one_euro_filter.py        # Gaze stabilization algorithm
│       ├── dwell_detector.py         # Adaptive dwell detection
│       ├── word_prediction.py        # N-gram word prediction engine
│       └── fatigue_monitor.py        # Break reminders + dry eye monitor
│
├── tobii-helper/                     # .NET Tobii bridge
│   └── TobiiGazeHelper/
│       ├── Program.cs                # TCP server + gaze data forwarding
│       ├── TobiiInterop.cs           # Stream Engine P/Invoke bindings
│       ├── TobiiGazeHelper.csproj    # Uses LOCAL lib/ DLLs (no hardcoded paths)
│       └── lib/                      # Bundled Tobii DLLs (machine-independent)
│
├── docs/                             # Documentation
│   ├── developer-onboarding-guide.md # Setup, workflow, and troubleshooting
│   ├── technical-architecture-guide.md # System internals and data flow
│   ├── build-and-installation-guide.md # Production build process
│   └── homedesign.md                 # GazePlan feature requirements and survey spec
│
├── CLAUDE.md                         # Claude Code project context
├── QUICK_INSTALL.md                  # Quick-reference build steps
├── setup.bat                         # First-time setup (run once)
├── start-dev.bat                     # Development launcher
├── build-installer.bat               # One-click installer builder
├── clean.bat                         # Clean build artifacts
├── copy-tobii-dlls.bat               # Refresh Tobii DLLs from system
├── package.json                      # Node.js config + electron-builder
├── vite.config.ts                    # Vite build configuration
├── tsconfig.json                     # TypeScript config
├── tsconfig.electron.json            # Electron TypeScript config
└── tsconfig.node.json                # Node TypeScript config
```

---

## Screens

| Screen | Purpose | Dwell Time |
|--------|---------|-----------|
| **Home** | Navigation hub with sidebar quick-actions | 600ms |
| **AAC Board** | 8-category communication grid | 550ms |
| **Keyboard** | Full-screen QWERTY with word prediction | 500ms |
| **Spatial Keyboard** | Large-target keyboard for limited control | 700ms |
| **Phrases** | Categorized phrase library | 550ms |
| **Medical** | Emergency, bed/position, daily care | 400ms (emergency) |
| **Feelings** | Emotions and feelings | 550ms |
| **Basic Needs** | Water, bathroom, position, temperature | 550ms |
| **People** | Family and contacts | 550ms |
| **Activities** | TV, YouTube, Alexa commands | 600ms |
| **Web Browsing** | Gaze-controlled web interface | 600ms |
| **Design Home** | GazePlan home design survey | 600ms |
| **Settings** | Filter presets, TTS, dwell timing | 600ms |

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Developer Onboarding](docs/developer-onboarding-guide.md) | Environment setup, workflow, batch scripts, troubleshooting |
| [Technical Architecture](docs/technical-architecture-guide.md) | Gaze data flow, internals, IPC protocols, component hierarchy |
| [Build & Installation](docs/build-and-installation-guide.md) | Production build process, PyInstaller, electron-builder, distribution |
| [GazePlan Requirements](docs/homedesign.md) | GazePlan home design feature spec and survey flow |
| [Home Planning E2E Guide](docs/home-planning-end-to-end-guide.md) | New-user sequence for Survey -> Compass -> Generate workflow |
| [Latest Script Quick Start](docs/latest-script-quick-start.md) | Session-safe commands for v4/smart/v5 script runs |
| [Floor Plan End User Guide](docs/floorplan-end-user-guide.md) | For installed-app users (UI-first workflow, no CLI required) |
| [Quick Install](QUICK_INSTALL.md) | Quick-reference build steps |

---

## Design Principles

1. **Large targets**: Minimum 80px buttons (2 degree visual angle at 60cm viewing distance)
2. **Dark mode primary**: `#0D1117` background (reduces eye strain for ALS patients)
3. **WCAG 2.1 AA**: 4.5:1 text contrast, 3:1 UI contrast
4. **Adaptive dwell**: 400ms emergency, 600ms standard, 1200ms safety-critical
5. **One Euro Filter**: Gaze stabilization with configurable presets
6. **Fatigue management**: 20-20-20 rule break reminders
7. **Bilingual**: English + Hindi on every button
8. **Responsive**: Supports 13" to 27" screens using `clamp()` and viewport units

---

## Tobii Eye Tracker 5

### Simulation Mode (No Hardware)

Run with `--simulate` flag. The app uses your mouse cursor as gaze input, suitable for development and testing.

### Hardware Mode

1. Install **Tobii Experience**: https://gaming.tobii.com/getstarted
2. Calibrate the eye tracker in Tobii Experience
3. Ensure gaze tracking is active
4. Run: `.\start-dev.bat`

### Tobii DLLs

The Tobii DLLs are bundled in `tobii-helper/TobiiGazeHelper/lib/` and referenced locally. No hardcoded system paths. The project builds on any machine regardless of where Tobii Experience is installed.

To update DLLs from a fresh Tobii installation:
```powershell
.\copy-tobii-dlls.bat
```

---

## Known Considerations

- **Tobii Licensing**: Redistributing Tobii DLLs may require a licensing agreement with Tobii. Verify with [Tobii's developer terms](https://developer.tobii.com/) before public distribution.
- **Port Conflicts**: The app uses ports 5555 (Tobii TCP) and 8765 (WebSocket). Port conflict handling with auto-fallback is built in.
- **Single Instance**: Only one instance of GazeConnect Pro can run at a time.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
