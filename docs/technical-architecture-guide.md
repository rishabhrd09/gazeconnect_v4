# Technical Architecture Guide

This document covers the internal architecture of GazeConnect Pro: how gaze data flows from hardware to UI action, how the three processes communicate, and how the React component hierarchy is organized.

> **Build:** v4.8.0 (gaze pipeline v17.10)
>
> For the comprehensive end-to-end pipeline reference with Mermaid diagrams covering every stage and constant, see [`eye-tracking-pipeline-textbook.html`](./eye-tracking-pipeline-textbook.html).

---

## System Overview

GazeConnect Pro consists of three independent processes that communicate over local network sockets:

```
+--------------------+    TCP:5555    +------------------+    WS:8765    +------------------+
| TobiiGazeHelper    | ------------> | Python Backend   | ------------> | Electron App     |
| (.NET 6.0, C#)     |               | (Python 3.10+)   |               | (React + TS)     |
|                    |               |                  |               |                  |
| Reads raw gaze     |               | Filters, smooths |               | Renders UI,      |
| from Tobii SDK     |               | predicts words,  |               | detects dwell,   |
| via Stream Engine  |               | manages TTS,     |               | triggers actions |
+--------------------+               | persists data    |               +------------------+
                                     +------------------+
```

### Why three processes?

- **Language isolation**: Each component uses the best tool for its job (C# for Tobii SDK, Python for ML/NLP, TypeScript for UI).
- **Crash isolation**: If the Tobii helper crashes, the UI and backend remain functional. The app degrades gracefully.
- **Development flexibility**: Frontend developers can work on UI without needing the eye tracker or Python backend (simulation mode).

---

## Complete Gaze Data Flow

This is the end-to-end path from eye movement to on-screen action:

### 1. Hardware Layer (Tobii Eye Tracker 5)

- USB device, 133Hz sampling rate
- Tracks both eyes using near-infrared illumination
- Outputs raw gaze coordinates as normalized screen fractions (0.0 to 1.0)

### 2. TobiiGazeHelper (.NET 6.0)

**Location**: `tobii-helper/TobiiGazeHelper/`

**Entry point**: `Program.cs`

**What it does**:
1. Loads Tobii DLLs from the local `lib/` folder (not from system paths)
2. Initializes the Tobii Stream Engine via P/Invoke bindings (`TobiiInterop.cs`)
3. Opens a TCP server on port 5555
4. On each gaze data callback (133Hz), sends a JSON message to the connected client:
   ```json
   {"type": "gaze", "x": 0.52, "y": 0.34, "ts": 1707123456789}
   ```
5. Coordinates are normalized (0.0-1.0) representing screen position

**Tobii DLL dependencies** (bundled in `lib/`):
- `tobii_stream_engine.dll` — Native driver, talks to USB hardware
- `Tobii.Interaction.Net.dll` — Managed .NET wrapper
- `Tobii.Interaction.Model.dll` — Data model types
- `Tobii.EyeX.Client.dll` — Legacy EyeX compatibility
- `Tobii.EyeX.Common.dll` — Shared EyeX types
- `Tobii.Tech.NETCommon.ClrExtensions.dll` — CLR extensions

These DLLs are referenced locally in `TobiiGazeHelper.csproj` so the project builds on any machine without requiring a specific Tobii installation path.

### 3. Python Backend (asyncio)

**Location**: `python/`

**Entry point**: `main.py`

**What it does**:
1. Connects to TobiiGazeHelper via TCP on port 5555
2. Runs a multi-layer filter pipeline (One Euro, Kalman, OptiKey 4-Zone, magnetism) on raw gaze data
3. Hosts a WebSocket server on port 8765
4. Forwards filtered gaze data to the Electron/React frontend
5. Provides additional services: word prediction, fatigue monitoring, TTS, survey data persistence

**Services** (`python/services/`):

| Service | File | Purpose |
|---------|------|---------|
| One Euro Filter + OptiKey 4-Zone | `one_euro_filter.py` | Multi-layer gaze filter: One Euro, Adaptive Kalman (state-aware), Anti-Recoil, OptiKey 4-Zone (LOCK/KEY/FIXATION/FREE). Context-aware parameters per screen. |
| Dwell Detector | `dwell_detector.py` | Server-side dwell detection with adaptive thresholds per action type. |
| Word Prediction | `word_prediction.py` | N-gram model + smart bigrams (1,339 pairs) + CIFG-LSTM neural fusion (1.9MB) + vocabulary boosting + RecencyTracker + PatientBigramTracker + time-of-day boost + Datamuse API (optional online). 110 blocked harmful words. Mean 13.5ms latency. |
| Sentence Prediction | `sentence_prediction.py` | Local sentence completion from patient history, 180 templates, and fuzzy matching. < 100ms, zero external deps. |
| Prediction Guardrails | `prediction_guardrails.py` | 110 blocked words (violent, harmful, inappropriate for ALS patients). Enforced at 20+ filter points across all prediction code paths. |
| Neural Language Model | `ml/inference.py` + `ml/fusion.py` | CIFG-LSTM (1.9MB ONNX, 661 vocab, 512 hidden). Fused with n-gram at 75/25 dynamic ratio. 30ms hard timeout. |
| Fatigue Monitor | `fatigue_monitor.py` | Tracks continuous gaze time. Triggers 20-20-20 rule break reminders and dry eye warnings. |

**WebSocket message types sent to frontend**:
```
gaze_data    — Filtered x,y coordinates + timestamp
predictions  — Word predictions (words[]) + sentence predictions (sentences[])
fatigue_warn — Break reminder trigger
tts_status   — TTS playback state
survey_data  — Survey load/save responses
```

### 4. Electron Main Process

**Location**: `electron/`

**Files**:
- `main.ts` — Creates the BrowserWindow, manages Python and Tobii process lifecycle, handles IPC
- `preload.ts` — Exposes a secure IPC bridge to the renderer process (contextBridge)

**Lifecycle**:
1. Creates a frameless BrowserWindow sized to the display
2. In development: loads `http://localhost:5173` (Vite dev server)
3. In production: loads bundled `dist/index.html`
4. Spawns the Python backend as a child process
5. Spawns TobiiGazeHelper as a child process (unless `--simulate` flag)
6. Monitors child processes and restarts them if they crash
7. On window close: terminates child processes, then exits

**IPC Bridge** (`preload.ts`):
- Exposes `window.electronAPI` to the renderer
- Used for native operations: file save dialogs, system notifications, process control

### 5. React Frontend (Renderer Process)

**Location**: `src/`

**Entry point**: `App.tsx`

**Gaze data arrives via WebSocket** (`useWebSocket.tsx`):
1. `useWebSocket` hook connects to `ws://localhost:8765`
2. On each `gaze` message, listeners in `listenersRef.current` are notified directly (no React state update — avoids re-render storms at 33 Hz).
3. `GazeCursor` component subscribes via `subscribeGaze(callback)` and runs the full frontend pipeline.

**Dwell detection** (centralised in `GazeCursor.tsx`, NOT per-button):
1. A single animation-frame loop (`dwellFrame`, ~60 Hz) runs the entire dwell state machine: onset → dwell → lock → click.
2. Hit testing identifies the active interactive element under the cursor on every frame (multi-point hit test + sticky tolerance + nearest-center fallback).
3. Once dwell completes, `GazeCursor` calls `dwellTargetRef.current.click()` directly — the target element's `onClick` handler fires as if it were a normal mouse click.
4. **`GazeButton` is a styling/affordance component**, not a dwell driver. It exposes `data-gaze*` attributes that the central machine consumes. This centralisation was a deliberate design choice that allows the v17 visual anchor (R2), savedDwell continuity, and lock-break gating to work consistently across all targets.

**Dwell timings (v17.10)**: 250 ms onset + 1000 ms dwell + 1300 ms cooldown. Lock fires at 10 % dwell progress. Lock-break requires both raw-gaze > 80 px from `lockPos` AND raw-gaze outside the target rect + 45 px tolerance — see [`eye-tracking-pipeline-textbook.html`](./eye-tracking-pipeline-textbook.html) Chapter 9 for the full state machine.

**Frontend filter stack** (in `GazeCursor.tsx`, applied to each gaze sample):
1. Coordinate transform (window vs. screen normalisation).
2. Edge-overshoot clamp ±48 px beyond viewport.
3. 3-tap weighted moving average (0.45/0.30/0.25).
4. Semantic snap (`gazeSnapping.ts`) — soft attraction to nearest gaze-enabled target.
5. Velocity-adaptive EMA per gaze state.
6. **R2 visual anchor** (v17.3): once dwell target is set, `posRef` is snapped to target centre every frame.
7. Render: `setX`, `setY` update the cursor div.

---

## Simulation Mode

When `--simulate` is passed to `start-dev.bat`:
1. TobiiGazeHelper is NOT spawned
2. The Python backend generates simulated gaze data from mouse cursor position
3. The React frontend receives the same WebSocket messages as hardware mode
4. All UI interactions work identically — mouse position replaces gaze position

This allows full development and testing without eye tracker hardware.

---

## React Component Hierarchy

```
App.tsx
├── RealGazeContext.Provider          # Gaze coordinates for all children
├── DwellTimeContext.Provider         # Configurable dwell durations
├── CustomizationContext.Provider     # User UI preferences
├── PeopleContext.Provider            # Contacts data
├── GazeCursor                        # Visual cursor overlay (always rendered)
└── [Current Screen]
    ├── GlobalNavBar                  # Top navigation (shared)
    │   └── GazeButton (x N)         # Nav items
    └── [Screen Content]
        └── GazeButton (x N)         # All interactive elements
```

### Core Components

**GazeButton** (`src/components/core/GazeButton.tsx`)
- The foundation of all user interaction
- Props: `id`, `onClick`, `gazeEnabled`, `gazeEnabledTimestamp`, `isDarkMode`, `dwellCategory`, `alwaysActive`, `style`
- Handles both mouse click and gaze dwell activation
- Shows visual dwell progress (fill animation)
- Minimum size enforced: 80px

**GazeCursor** (`src/components/core/GazeCursor.tsx`)
- Renders a visual indicator at the current gaze position
- Uses One Euro Filter output for smooth movement
- Multi-point hit testing for accuracy at screen edges
- Fades when gaze leaves the window

**GazeControlToggle** (`src/components/core/GazeControlToggle.tsx`)
- React hook (`useGazeControl`) that manages gaze enable/disable state
- When disabled, GazeButtons only respond to mouse clicks
- Toggle button is `alwaysActive` (responds even when gaze is disabled)

### Context Providers

| Context | File | Data |
|---------|------|------|
| RealGazeContext | `src/contexts/RealGazeContext.tsx` | Current gaze x,y, validity, timestamp |
| DwellTimeContext | `src/contexts/DwellTimeContext.tsx` | Dwell durations per category |
| CustomizationContext | `src/contexts/CustomizationContext.tsx` | Home layout, sidebar actions, footer actions |
| PeopleContext | `src/contexts/PeopleContext.tsx` | Contact list data |

---

## Communication Protocols

### TCP (Port 5555): TobiiGazeHelper -> Python

- Newline-delimited JSON
- One message per gaze sample (~133 messages/second)
- Message format: `{"type": "gaze", "x": float, "y": float, "ts": int}\n`
- Connection: Python connects as TCP client, TobiiGazeHelper is the server

### WebSocket (Port 8765): Python -> Electron/React

- Standard WebSocket protocol
- JSON messages with a `type` field for routing
- Bidirectional: frontend sends commands (TTS requests, survey saves), backend sends data (gaze, predictions)
- Auto-reconnect on disconnect with exponential backoff

### IPC (Electron): Main Process <-> Renderer

- Electron `contextBridge` via `preload.ts`
- Used for native OS operations only (file dialogs, notifications)
- Gaze data does NOT flow through IPC — it uses WebSocket directly

---

## Design Token System

All visual constants are centralized in `src/utils/design.ts`:

- **Colors**: `darkColors`, `lightColors`, `screenThemes` (per-screen color overrides)
- **Typography**: Font families, sizes, weights
- **Spacing**: Padding, margins, gaps
- **Screen themes**: Each screen has a theme object (e.g., `screenThemes.home`, `screenThemes.floorPlan`)

This prevents magic numbers in component code and ensures visual consistency.

---

## Data Persistence

| Data | Storage | Location |
|------|---------|----------|
| Survey answers | localStorage + WebSocket save | Browser localStorage, `survey_data/` folder |
| User settings | localStorage | Browser localStorage |
| People/contacts | React context + localStorage | Browser localStorage |
| Phrases | Static data + localStorage overrides | `src/data/` |
| Word prediction model | N-gram + user data | `python/data/custom_dictionary.json` |
| Smart bigrams | Pre-computed word-pair frequencies (read-only) | `python/data/smart_bigrams.json` (36KB) |
| Neural LM | CIFG-LSTM ONNX model (read-only) | `python/ml/trained_models/gazeconnect_lm_quantized.onnx` (1.9MB) |
| Recency scores | Word usage timestamps | `python/data/patient_data/recency_scores.json` |
| Patient bigrams | Word-pair frequencies | `python/data/patient_data/patient_bigrams.json` |
| Sentence history | Spoken sentence log | `python/data/patient_data/patient_sentences.json` |
| Blocked words | 110 harmful words permanently filtered | `python/prediction_guardrails.py` (code, not data) |

---

## Port Summary

| Port | Protocol | From | To | Purpose |
|------|----------|------|----|---------|
| 5555 | TCP | Python | TobiiGazeHelper | Raw gaze data stream |
| 8765 | WebSocket | React | Python | Filtered gaze, predictions, TTS, survey |
| 5173 | HTTP | Browser | Vite | Dev server (development only) |
