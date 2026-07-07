# GazeConnect Pro - Project Context

## What This Is
Medical-grade AAC (Augmentative & Alternative Communication) app for ALS/MND patients using Tobii Eye Tracker 5. Built for Papa — and for every ALS patient who deserves to communicate freely.

## Architecture
- **Frontend**: Electron 28 + React 18 + TypeScript + Vite 5
- **Backend**: Python 3.10+ (asyncio WebSocket server on port 8765)
- **Eye Tracking**: .NET 6.0 TobiiGazeHelper (TCP port 5555)
- **TTS**: pyttsx3 (SAPI5) + browser SpeechSynthesis fallback

## Key Constraints
- ALL UI must work with eye-gaze (dwell-based selection, NO drag/drop)
- Minimum button size: 80px (2° visual angle at 60cm viewing distance)
- Must support 13" to 27" screens (use clamp() and viewport units, NOT fixed px)
- Dark mode is primary (reduces eye strain for ALS patients)
- Bilingual: English + Hindi
- Emergency buttons must ALWAYS be accessible. Current code keeps urgent controls always-active in key contexts; default dwell values come from `src/config/dwellTimeConfig.ts` (`medicalUrgent: 900ms`, `emergencyButton: 2000ms`) to reduce accidental activation.
- No scrolling on main screens (everything must fit within viewport)
- overflow:hidden is intentional — content must fit, not scroll

## Development Commands
- `npm run dev` — Start Vite dev server (UI only, for rapid iteration)
- `.\start-dev.bat` — Full app (Electron + Python + Tobii)
- `.\start-dev.bat --simulate` — Without eye tracker (mouse-as-gaze mode)
- `.\build-installer.bat` — Build production .exe installer

## Runtime Logging Safety
- Never run the live gaze app directly in Codex with continuous stdout logs.
- For runtime checks, redirect logs to a file and inspect only tail/grep output.
- Disable high-frequency gaze logs by default. Use `GAZE_DEBUG=1` only when needed.

## File Structure
- `src/screens/` — 19 screen files. Active routes are defined in `src/App.tsx`; `AlertModeScreen` renders out-of-band and `CalibrationScreen` exists but is not currently routed.
- `src/components/core/` — GazeButton, GazeCursor, GazeControlToggle
- `src/components/GlobalNavBar.tsx` — Top nav bar on every screen
- `src/utils/design.ts` — Design tokens, colors, typography, spacing
- `python/` — Backend (WebSocket server, word prediction, filters)
- `python/services/word_prediction.py` — Word prediction engine (n-gram + smart bigrams + CIFG-LSTM neural fusion)
- `python/prediction_guardrails.py` — 158 blocked harmful word tokens + 8 blocked phrases (English + Hindi/Hinglish), enforced across all prediction paths
- `python/data/smart_bigrams.json` — Pre-computed 1,339 word-pair frequencies (36KB)
- `python/ml/` — CIFG-LSTM neural model (1.9MB ONNX) + inference + fusion
- `electron/` — Electron main process + preload
- `tobii-helper/` — .NET 6.0 eye tracker bridge (C#)

## Word Prediction System (v3)
- **Core offline pipeline**: N-gram + Smart Bigrams + Neural Fusion + Patient Personalization
- **Safety**: 158 blocked word tokens + 8 blocked phrases (violent, harmful, inappropriate; English + Hindi/Hinglish) — never surface as predictions
- **Performance**: 13.5ms mean latency, 30ms neural timeout, zero impact on 66Hz gaze pipeline
- **Neural model**: CIFG-LSTM, 1.9MB, 661 vocab — adds ~10-15% quality via semantic reranking
- **Datamuse API**: Implemented but OFF by default (`enable_datamuse=False`); if explicitly enabled, it is optional online enrichment after local predictions, with a 300ms background timeout
- **Patient priority**: Patient-learned words always rank highest (3x bigram boost, 2x vocab boost)

## When Making Changes
1. NEVER break gaze functionality or dwell timings
2. NEVER break the 23" (1920×1080) tested layout — only ADD support for smaller screens
3. Use `clamp(min, preferred, max)` for responsive sizing
4. Test that all content fits within viewport on both 768px and 1080px heights
5. Keep the dark theme aesthetic (warm/dark surfaces, strong contrast, gaze accent around #2DD4BF)
6. Emergency elements must remain visually prominent and always accessible
