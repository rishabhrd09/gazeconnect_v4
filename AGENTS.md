# GazeConnect Pro - Project Context

## What This Is
AAC (Augmentative & Alternative Communication) app for ALS/MND patients using Tobii Eye Tracker 5. Built for Papa — and for every ALS patient who deserves to communicate freely.

## Architecture
- **Frontend**: Electron 28 + React 18 + TypeScript + Vite 5
- **Backend**: Python 3.10+ (asyncio WebSocket server on port 8765)
- **Eye Tracking**: .NET 8 x64 self-contained TobiiGazeHelper (TCP port 5555)
- **TTS**: pyttsx3 (SAPI5) + browser SpeechSynthesis fallback

## Key Constraints
- ALL UI must work with eye-gaze (dwell-based selection, NO drag/drop)
- Minimum primary gaze target: 80 CSS pixels; physical size depends on display density and scaling.
- Must support 13" to 27" screens (use clamp() and viewport units, NOT fixed px)
- Dark mode is primary (reduces eye strain for ALS patients)
- English-only UI for this release. Do not add Hindi translations, language toggles or dual-language fields; Hindi support is a separate future task.
- Product scope: communication and activities, not a reliable alert system. Do not reintroduce global emergency buttons. Keep existing care phrases and the separate Alert Mode board.
- Selection durations live in `src/config/dwellTimeConfig.ts` as exactly three complete timing sets of the same five action groups (Typing / Words & suggestions / Communication / Navigation & choices / Deliberate actions): **Quick** 500/1000/1250/1500/2000ms (the original timings), **Balanced** 900/1300/1600/1900/2500ms (default) and **Relaxed** 1300/1700/2000/2400/3000ms. The person chooses one set in Settings -> Selection Speed (maintainer decision, 21 Sep 2026: the original timings were too fast for a first-time user). Do not add a fourth set, per-button sliders, multipliers or repeat-key acceleration. The embedded browser accepts only `ALL_DWELL_DURATIONS_MS`; `npm run check:dwell-groups` fails if its two literal lists drift from the config. Onset/cooldown and tracking safeguards are separate internal controls.
- There is no manual gaze-offset control. The measured tracker error changes direction across the screen, so one global shift only moved the fault; saved offsets are normalized to 0. Recalibrate in Tobii Experience instead.
- Mouse, touch and pen stay usable beside gaze. `GazeCursor` arbitrates: a physical press abandons any dwell in progress and starts the normal cooldown, so one intention never presses a control twice. Mouse HOVER never dwells while gaze is the input owner.
- The app runs **full screen** (maintainer decision, 21 Sep 2026; the default since 22 Sep 2026): maximised, the bottom row of controls sits against the taskbar edge, and the live recordings show the tracker reporting gaze inside that 48 px strip while a bottom control is looked at (a 1920x1032 window lost 178 of 2066 bottom-third samples there). The window is shown maximised, then full screen is requested once it is visible and opaque, after a 400 ms settle (`enterStartupFullScreen` in `electron/main.ts`); `GAZECONNECT_START_FULLSCREEN=0` starts maximised as before. Do not call `setFullScreen` on a hidden or transparent window. The 21 Sep hang first blamed on that (main process at 100 % CPU, IPC dead, no geometry reported, gaze dead) is most likely the broken-console loop in the next bullet: a 22 Sep rehearsal of the exact start-up on the rig could not make full screen hang on any path, while the same hang appeared on 22 Sep with no full-screen call at all. The real app's full-screen start was then verified on the rig in simulate mode (interface reported 1920x1080, main process responsive); a tracker session in full screen is still to come. The right-click menu, the View menu and the Zone Board button toggle full screen on the visible window.
- Electron's main process must survive losing the console that launched it (terminal closed, launcher gone). Its stdout/stderr then become broken pipes; a failed console write used to become an uncaught exception whose handler logged again and failed again, forever: the main thread spun at 100 %, stopped answering IPC and window messages, and could not remove a web page it was asked to close (stack read from the hung process on the rig, 22 Sep 2026). `electron/stdioGuard.ts` is installed first thing in `main.ts`; it owns the `uncaughtException` handler and moves later log lines to `tools\reports\main-console-*.log` (installed app: Electron's logs folder). Never add a handler or logger that writes to the console without it.
- The embedded web page (YouTube, Quick Search) is a native `BrowserView` drawn over the whole window, not part of the DOM: nothing in React removes it. Closing it detaches it from the window first, then gives the page's own cleanup at most 400 ms (`electron/browser/browserViewController.ts`); never await a page script before the view is off the window (`executeJavaScript` waits indefinitely while a page is loading, which left YouTube over the Home screen). Every open/close/reset takes a ticket so a stale open can neither resurrect a page nor close its successor, the interface closes any page whenever it is not on the web screen or reloads, and the main process closes it when the interface reloads or its renderer dies.
- Gaze is never clamped onto a window edge that borders other UI (taskbar, another window). The single exception, same decision: gaze reported at most **48 CSS px past a physical screen edge that is also the window edge** is taken to be at that edge (`SCREEN_EDGE_BAND_PX` in `python/main.py`), because the tracker reports gaze slightly off the glass while a bottom-row control is being looked at. Farther out it is rejected as before. Do not widen the band, apply it to other edges, or tune it per edge without new fixation evidence. Known consequence: resting the eyes on the bezel within about 13 mm of the screen can count as looking at the edge control beside it; the gaze toggle is the rest position.
- The helper requests Tobii's **unfiltered** gaze stream (same decision: judged faster on the tracker; a real eye movement crossed in a median 62 ms against 91 ms with the vendor's `LightlyFiltered` smoothing). On that stream the backend estimator waits one sample before following a jump. `GAZE_HELPER_STREAM=lightly_filtered` is the rollback.
- The gaze cursor is a **bubble at the centre of the target the eyes are on** (maintainer decision, 22 Sep 2026; `src/utils/gazeFocus.ts`, `src/components/core/GazeCursor.tsx`): decide the key or card first, then show the bubble at its centre, and move centre to centre. The target is decided on the backend's estimate with hysteresis (a new target on its second sample; the current one kept within 30 px of its box, 60/110 px when nothing else is there; released after 180 ms), every move is one spring glide, and the dwell always belongs to the focused target, with its onset credited from the first sample so no selection got slower. Off target it rests where the eyes are and follows only a lasting shift. Look: Tobii Experience's "Preview my gaze", a light ring with a clear centre and a soft dark edge, no centre dot; the dwell fills the ring in teal. The embedded browser ring follows the same rule (v17.26). Do not reintroduce a cursor drawn at the raw gaze over a target, a recentring after it has appeared, a filled cursor centre, or an opaque dwell highlight (the cursor's `data-cursor` layers are excluded from the page-background rule in `src/refinement.css`, which had hidden the label of the key being selected).
- Dwell progress belongs to the target that earned it (23 Sep 2026; `src/utils/dwellProgressBank.ts`): it is banked **per target** for a second and handed back only when the RAW gaze is within 45 px of that target's box (`RESUME_RAW_TOLERANCE_PX`), so a glance at the key beside the space bar no longer costs a nearly full ring, and no ring can fill while the eyes are elsewhere. The bank is cleared on every selection and on any dwell reset. A ring past 40 % also holds its target harder (`COMMIT_*` in `gazeFocus.ts`: keep-zone 30 -> 70 px, a competitor must hold the gaze 25 -> 120 ms), and that commitment applies only while the dwell is live. Do not go back to discarding progress when a neighbour starts its onset, and never resume without the raw-gaze check.
- No scrolling on main screens (everything must fit within viewport)
- overflow:hidden is intentional — content must fit, not scroll

## Development Commands
- `npm run dev` — Start Vite dev server (UI only, for rapid iteration)
- `.\start-dev.bat` — Full app (Electron + Python + Tobii). The interface is the BUILT one from `dist`, rebuilt automatically when a source file is newer than the build: measured 23 Sep 2026, the window is on screen 7 s after the launch instead of 25-32 s
- `.\start-dev.bat --hot` — Same app, interface served by Vite with live reloading. Slower to start, and the only mode where an edit reaches an app that is already running (so never use it while the maintainer is testing)
- `.\start-dev.bat --simulate` — Without eye tracker (mouse-as-gaze mode)
- `.\start-dev.bat --quiet` — Same launch with output written only to `tools\reports\dev-*.log` (use this for agent-driven runs)
- `.\stop-dev.bat` — Close the running development app from any terminal (only processes from this checkout). `--force` additionally stops a program outside the checkout that holds 8765 or 5555, after naming it
- `.\status-dev.bat` — What is running from this checkout and who holds each port; changes nothing (exit 0 ready, 1 running, 2 a fixed port is held by something else)
- Launch port handling: a previous GazeConnect (this checkout or the installed app) is closed automatically; the interface server (5173-5183) and floor plan server (5050-5060) take the next free port; backend 8765 and helper 5555 stay fixed, and a foreign program holding them is named, never stopped.
- `.\build-installer.bat` — Build production .exe installer
- `.\check-windows.bat` — Finite Windows dependency, DLL and port readiness checks after setup

## Runtime Logging Safety
- Never run the live gaze app directly in Codex with continuous stdout logs.
- For runtime checks, redirect logs to a file and inspect only tail/grep output. The launcher streams to the maintainer's console by default; agents launch with `--quiet`.
- Disable high-frequency gaze logs by default. Use `GAZE_DEBUG=1` only when needed.

## File Structure
- `src/screens/` — 19 screen files. Active routes are defined in `src/App.tsx`; `AlertModeScreen` renders out-of-band and `CalibrationScreen` exists but is not currently routed.
- `src/components/core/` — GazeButton, GazeCursor, GazeControlToggle
- `src/components/GlobalNavBar.tsx` — Top nav bar on every screen
- `src/utils/design.ts` — Design tokens, colors, typography, spacing
- `python/` — Backend (WebSocket server, word prediction, filters)
- `python/services/deterministic_prediction/` — Default word predictor (deterministic GazeCompass port: engine, worker process, learning, policy)
- `python/services/word_prediction.py` — Legacy word prediction engine (n-gram + smart bigrams + CIFG-LSTM neural fusion), kept as a rollback
- `python/prediction_guardrails.py` — 226 blocked harmful word tokens (incl. inflections) + 8 blocked phrases (English + Hindi/Hinglish), enforced across all prediction paths
- `python/data/smart_bigrams.json` — Legacy engine: pre-computed 1,339 word-pair frequencies (36KB)
- `python/ml/` — Legacy engine: CIFG-LSTM neural model (1.9MB ONNX) + inference + fusion
- `electron/` — Electron main process + preload
- `tobii-helper/` — .NET 8 eye tracker bridge (C#); reports the Tobii engine's own state (`status` lines) and recovers a stalled stream, see `tobii-helper/README.md`

## Word Prediction System (v4, deterministic)
- **Default engine**: `python/services/deterministic_prediction/`, a port of the GazeCompass deterministic predictor (pinned `de33a95`, stage-level parity with 0 mismatches). No network, LLM, neural model, randomness or clock: the same draft, learned state and slot lineage always give the same slots. Details: `docs/deterministic-prediction/README.md`
- **Ten word slots** on the traditional keyboard (5 top + phrase cell, 5 bottom). `word_slots` are fixed positions (`null` = deliberately empty); phrase suggestions travel separately in `sentences`
- **Execution**: runs in a separate worker process (latest-only per client, stale results dropped) — no measured impact on the 66Hz gaze loop; warm round trip ~1ms p50, <4ms max
- **Safety**: reference content policy + `python/prediction_guardrails.py` (every lexicon inflection of a blocked word is blocked too) + English-only display (`english_only_policy.v1.json`)
- **Learning**: committed actions only (accepted words, spoken messages); local `patient_data/deterministic_prediction_state.v1.json`; Delete Word undoes an acceptance
- **Tests**: `python -m unittest discover -s python/tests -p "test_deterministic_*.py"` (replays a reference parity fixture) and `npm run check:word-slots`
- **The worker process is fragile to what the backend does with its own stdio (Windows).** On 23 Sep 2026 a thread reading the backend's stdin (to notice Electron dying) made `multiprocessing.spawn` fail with "Access is denied": the worker never started and the keyboard showed no words for a whole session, while every other check passed. The backend now waits on Electron's process instead (`--parent-pid`, `watch_parent_process` in `python/main.py`). Never read stdin in the backend again, and keep `python/tests/test_port_contract.py` green: it asks a backend started the way Electron starts it for predictions
- **Legacy rollback**: `--prediction-engine legacy` or `GAZECONNECT_PREDICTION_ENGINE=legacy` (n-gram + smart bigrams + CIFG-LSTM ONNX reranker). **Datamuse API**: implemented but OFF by default (`enable_datamuse=False`)

## When Making Changes
1. NEVER break gaze functionality or dwell timings
2. NEVER break the 23" (1920×1080) tested layout — only ADD support for smaller screens
3. Use `clamp(min, preferred, max)` for responsive sizing
4. Test that all content fits within viewport on both 768px and 1080px heights
5. Keep the dark theme aesthetic (warm/dark surfaces, strong contrast, gaze accent around #2DD4BF)
6. Keep Warm and Dark only. Preserve content and question/option order. Survey options and room choices use large paged grids; navigation must not overlap active choices.
