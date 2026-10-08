# GazeConnect Pro - Project Context

## What This Is
Medical-grade AAC (Augmentative & Alternative Communication) app for ALS/MND patients using Tobii Eye Tracker 5. Built for Papa — and for every ALS patient who deserves to communicate freely.

## Architecture
- **Frontend**: Electron 44 + React 18 + TypeScript + Vite 5 (Node.js 22.12+ for development)
- **Backend**: Python 3.10+ (asyncio WebSocket server on port 8765)
- **Eye Tracking**: .NET 8 x64 self-contained TobiiGazeHelper (TCP port 5555)
- **TTS**: pyttsx3 (SAPI5) + browser SpeechSynthesis fallback

## Key Constraints
- ALL UI must work with eye-gaze (dwell-based selection, NO drag/drop)
- Minimum button size: 80px (2° visual angle at 60cm viewing distance)
- Must support 13" to 27" screens (use clamp() and viewport units, NOT fixed px)
- Dark mode is primary (reduces eye strain for ALS patients)
- Three themes: Dark (default), Warm, and the optional Midnight Navy (`src/styles/midnight-navy.css`, a removable layer scoped to `data-theme='midnight-navy'`; details in AGENTS.md). Add no others
- Bilingual: English + Hindi
- Emergency buttons must ALWAYS be accessible (always-active: they respond even with gaze toggled off and during navigation cooldowns; dwell is 2000ms at Balanced and 3400ms at Calm, the speed a new profile starts on — deliberately the longest selection in every set, to prevent accidental activation: twice the key time, 1450–4000ms across the ten Selection Speed sets in `src/config/dwellTimeConfig.ts`, the single authoritative dwell table)
- Embedded web pages (YouTube, Quick Search) run in their own hardened session (`electron/browser/browserSafety.ts`: no downloads, device or permission grants, or local-network access). The interface sends pages named commands only; never add an IPC channel that runs arbitrary script, keystrokes or clicks in a page
- No scrolling on main screens (everything must fit within viewport)
- overflow:hidden is intentional — content must fit, not scroll

## Development Commands
- `.\setup.bat` — Prepare the checkout (`--simulate` skips the helper build, `--force` reinstalls). Python comes from the `py` launcher (3.12 first), never PATH order; pinned versions live in `python/constraints.txt`. `start-dev.bat` stops with "Setup is needed" until setup has verified the current requirements (details in AGENTS.md)
- `npm run dev` — Start Vite dev server (UI only, for rapid iteration)
- `.\start-dev.bat` — Full app (Electron + Python + Tobii)
- `.\start-dev.bat --simulate` — Without eye tracker (mouse-as-gaze mode)
- `.\build-installer.bat` — Build production .exe installer

## File Structure
- `src/screens/` — 19 screen files. Active routes are defined in `src/App.tsx`; `AlertModeScreen` renders out-of-band and `CalibrationScreen` exists but is not currently routed.
- `src/components/core/` — GazeButton, GazeCursor, GazeControlToggle
- `src/components/GlobalNavBar.tsx` — Top nav bar on every screen
- `src/utils/design.ts` — Design tokens, colors, typography, spacing
- `python/` — Backend (WebSocket server, word prediction, filters)
- `python/services/deterministic_prediction/` — Default word predictor (deterministic GazeCompass port: engine, worker process, learning, policy)
- `python/services/word_prediction.py` — Legacy word prediction engine (n-gram + smart bigrams + CIFG-LSTM neural fusion), kept as a rollback
- `python/prediction_guardrails.py` — blocked harmful words and their inflections (English + Hindi/Hinglish), enforced across all prediction paths
- `python/data/smart_bigrams.json` — Legacy engine: pre-computed 1,339 word-pair frequencies (36KB)
- `python/ml/` — Legacy engine: CIFG-LSTM neural model (1.9MB ONNX) + inference + fusion
- `electron/` — Electron main process + preload
- `tobii-helper/` — .NET 8 eye tracker bridge (C#)

## Word Prediction System (v4, deterministic)
- **Default engine**: `python/services/deterministic_prediction/`, a port of the GazeCompass deterministic predictor (pinned `de33a95`, stage-level parity with 0 mismatches). No network, LLM, neural model, randomness or clock: the same draft, learned state and slot lineage always give the same slots. Details: `docs/deterministic-prediction/README.md`
- **Ten word slots** on the traditional keyboard (5 top + phrase cell, 5 bottom). `word_slots` are fixed positions (`null` = deliberately empty); phrase suggestions travel separately in `sentences`
- **Execution**: runs in a separate worker process (latest-only per client, stale results dropped) — no measured impact on the 66Hz gaze loop; warm round trip ~1ms p50, <4ms max
- **Safety**: reference content policy + `python/prediction_guardrails.py` (every lexicon inflection of a blocked word is blocked too) + English-only display (`english_only_policy.v1.json`)
- **Learning**: committed actions only (accepted words, spoken messages); local `patient_data/deterministic_prediction_state.v1.json`; Delete Word undoes an acceptance
- **Tests**: `python -m unittest discover -s python/tests -p "test_deterministic_*.py"` (replays a reference parity fixture) and `npm run check:word-slots`
- **Legacy rollback**: `--prediction-engine legacy` or `GAZECONNECT_PREDICTION_ENGINE=legacy` (n-gram + smart bigrams + CIFG-LSTM ONNX reranker). **Datamuse API**: implemented but OFF by default (`enable_datamuse=False`)

## When Making Changes
1. NEVER break gaze functionality or dwell timings
2. NEVER break the 23" (1920×1080) tested layout — only ADD support for smaller screens
3. Use `clamp(min, preferred, max)` for responsive sizing
4. Test that all content fits within viewport on both 768px and 1080px heights
5. Keep the dark theme aesthetic (bg: #0D1117, accent: #2DD4BF)
6. Emergency elements must remain visually prominent and always accessible
