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
- Emergency buttons must ALWAYS be accessible (always-active: they respond even with gaze toggled off and during navigation cooldowns; shipped dwell is 2000ms — deliberately long to prevent accidental activation, user-adjustable 1400–4000ms in `src/config/dwellTimeConfig.ts`, the single authoritative dwell table)
- No scrolling on main screens (everything must fit within viewport)
- overflow:hidden is intentional — content must fit, not scroll

## Development Commands
- `npm run dev` — Start Vite dev server (UI only, for rapid iteration)
- `.\start-dev.bat` — Full app (Electron + Python + Tobii)
- `.\start-dev.bat --simulate` — Without eye tracker (mouse-as-gaze mode)
- `.\build-installer.bat` — Build production .exe installer

## File Structure
- `src/screens/` — All 13 app screens
- `src/components/core/` — GazeButton, GazeCursor, GazeControlToggle
- `src/components/GlobalNavBar.tsx` — Top nav bar on every screen
- `src/utils/design.ts` — Design tokens, colors, typography, spacing
- `python/` — Backend (WebSocket server, word prediction, filters)
- `python/services/word_prediction.py` — Word prediction engine (n-gram + smart bigrams + CIFG-LSTM neural fusion)
- `python/prediction_guardrails.py` — blocked harmful words (English + Hindi/Hinglish), enforced across all prediction paths
- `python/data/smart_bigrams.json` — Pre-computed 1,339 word-pair frequencies (36KB)
- `python/ml/` — CIFG-LSTM neural model (1.9MB ONNX) + inference + fusion
- `electron/` — Electron main process + preload
- `tobii-helper/` — .NET 6.0 eye tracker bridge (C#)

## Word Prediction System (v3)
- **4-layer pipeline**: N-gram + Smart Bigrams + Neural Fusion + Patient Personalization
- **Safety**: blocked-word guardrails (violent, harmful, inappropriate) in English AND Hindi/Hinglish — never surface as predictions (`python/prediction_guardrails.py`)
- **Performance**: 13.5ms mean latency, 30ms neural timeout, zero impact on 66Hz gaze pipeline
- **Neural model**: CIFG-LSTM, 1.9MB, 661 vocab — adds ~10-15% quality via semantic reranking
- **Datamuse API**: NOT implemented (was documented but never built; keep out of the pipeline unless actually added)
- **Patient priority**: Patient-learned words always rank highest (3x bigram boost, 2x vocab boost)

## When Making Changes
1. NEVER break gaze functionality or dwell timings
2. NEVER break the 23" (1920×1080) tested layout — only ADD support for smaller screens
3. Use `clamp(min, preferred, max)` for responsive sizing
4. Test that all content fits within viewport on both 768px and 1080px heights
5. Keep the dark theme aesthetic (bg: #0D1117, accent: #2DD4BF)
6. Emergency elements must remain visually prominent and always accessible
