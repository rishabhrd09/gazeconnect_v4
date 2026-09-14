# Windows and Tobii validation handoff

Copy the prompt below into a new coding-agent conversation opened in this Windows checkout. This is the current handoff; older audit documents contain historical findings and superseded UI/timing requirements. Verify the actual checked-out code before relying on any recorded result.

---

You are continuing GazeConnect Pro as a senior Windows desktop, C#, Python, TypeScript and accessibility engineer. Work directly in this repository. My Tobii Eye Tracker 5 is attached to this Windows laptop. First inspect the machine and repository instead of assuming any tool, dependency, driver or service is installed.

Repository: https://github.com/rishabhrd09/gazeconnect_v4.git
Expected branch: featuring/ui-design-windows-production-refinement

## Vision and working agreement

This is a free, open-source communication and everyday-activities application for people with ALS/MND. Preserve the successful Tobii functionality and familiar communication workflow while making the application comfortable, readable, lightweight and dependable enough to share after validation. It is a communication aid, not a certified medical device or dependable emergency notification system. Never promise zero latency, perfect accuracy or clinical validation.

The previous development host was a Mac. Windows 10 and Windows 11 x64 are the product targets. The original application worked with the maintainer's tracker on Windows 10, but this branch includes substantial changes to the gaze pipeline, runtime and packaging. It must be treated as unvalidated on physical Windows/Tobii hardware until measured here. Preserve a known-working baseline and personal settings for comparison and recovery.

Autonomously inspect, run finite automated tests, diagnose failures and implement necessary local fixes. Do not stop at a plan or a superficial visual review. Preserve unrelated changes. Record the starting branch, commit and working-tree status; never reset/discard work. Keep this branch unless another is necessary; any new branch must begin with featuring/, not codex/. Do not commit, push, publish, change repository visibility or distribute installers unless I ask. Do not alter drivers, disable Windows security, install random DLL packages, kill unrelated processes or delete user data to make a check pass. Diagnose missing prerequisites and report what is needed. Ask for physical actions only when hardware testing requires my participation.

## Read first

Read AGENTS.md, README.md and docs/windows-local-testing.md. Then read the relevant code alongside:

- docs/windows-release-audit.md
- docs/eye-tracking-engineering-audit-2026-09-14.md
- docs/gaze-backend-audit.md
- docs/optikey-gaze-reference-review.md
- docs/windows-production-and-ui-refinement-plan.md

These include historical stages. The requirements below and the current code supersede old references to four dwell times, bilingual UI, global emergency controls, .NET 6 or unchanged filtering. Do not blindly reinstate obsolete behavior from an old paragraph.

## Product requirements to preserve

1. Warm and Dark only. English-only UI: no Hindi, dual-language labels or language toggle. Hindi is a separate future task. Preserve stored personal content.
2. Keep existing screen/board names, phrases, room names, question order, navigation destinations and learned spatial arrangements. Changes to geometry should address a demonstrated usability defect. No broad redesign during Windows validation.
3. Calm, matte, professional surfaces; readable typography and contrast; no glossy treatments or moving/scaling gaze targets. Keep large stationary targets, at least 80 CSS pixels, and preferably larger for primary choices. Main communication screens must fit without scrolling or drag-and-drop. Settings remains a scrollable, mouse-operated caregiver page.
4. No global emergency controls. Existing care phrases and the separate Alert Mode communication board remain; do not advertise it as a reliable alert mechanism. Home shows the clock in the former navbar emergency area.
5. Exactly five fixed dwell durations, automatically assigned to actions: 500ms letters/keys; 1000ms word suggestions/alphabet groups; 1250ms communication; 1500ms navigation/choices; 2000ms deliberate actions such as gaze toggles, text clearing and confirmations. No per-button sliders, arbitrary extra durations or repeat acceleration. src/config/dwellTimeConfig.ts is authoritative. Check renderer, mouse simulation and embedded-browser behavior together. Onset, navigation pauses, cooldowns, zone-entry buffering and freshness guards are separate and can add time; do not remove them to advertise the dwell duration as total end-to-end latency.
6. Both keyboards use shared KeyboardMessageDisplay typography, colors, Speak and Expand controls. Text must survive switching keyboards and Quick Phrases round trips.
7. Zone Board has five alphabet groups in their existing positions, six suggestions, a central current word, Delete/Space/Speak and large navigation controls. No number-of-letters question. Native full-screen entry and exit must work. Traditional Keyboard retains alphabet/numeric modes and shown/hidden navigation. Its navigation layout now allocates separate space to Quick Words, gaze toggle and Full Screen; do not restore equal side columns that caused overlap.
8. Food/Diet communication includes “I want food”, “I am hungry” and “I need my diet”. Gmail, LinkedIn and WhatsApp intentionally show Coming soon. Preserve that scope. Validate real browsing/YouTube separately.
9. Home Design includes the survey, Compass map, room selection, floor switching, refinements, generation and export. Preserve content and floor-specific data. Pointer clicks must work directly; READY gates gaze where shown. Keep cell/option targets large and layouts readable.

## What this branch changed

- Refined Warm/Dark appearance, shared navigation, care cards, Settings, Home Design and browsing; removed extra themes, global emergency wiring and bilingual presentation. Added food phrases and social placeholders.
- Redesigned Zone Board and unified keyboard message displays. Corrected the traditional keyboard navigation overlap, short letter rows and clipped Quick Words label; improved the Dark gaze label. Replaced the earlier four timing groups with the five values above in actual selection logic, including Electron validation and browser injection.
- C# helper uses a bounded latest-sample mailbox and moves socket writes off SDK callbacks. Transport and frontend preserve validity, age, ordering and intent metadata. Explicit coordinate-space conversion replaces edge stretching/guesswork; old in-app correction profiles are versioned out, while Tobii Experience calibration is retained.
- Replaced previous filtering implementations with an original elapsed-time adaptive smoother in Python. Renderer/browser bypass duplicate smoothing for adaptive_cursor_v1. Raw mapped intent supports escaping target locks. Balanced, Responsive, Steady and Gentle are smoothing choices, not appearance themes or dwell multipliers. These engineering changes need hardware comparison against the working baseline.
- Strengthened invalid/stale-data handling, tracking-loss resets, browser request backpressure and native click freshness checks. Real tracking loss must never silently become mouse-as-gaze selection. Explicit simulation remains available.
- Windows .bat entry points now call PowerShell 5.1 scripts. Setup uses npm ci and a Windows Python venv. Scripts validate versions/architecture, quote paths, report port owners and avoid killing unrelated applications. Helper target is .NET 8 win-x64, self-contained for packaging. This runtime migration needs native interoperability testing and a servicing review before public release.
- Installer staging validates DLLs, model assets and runtimes. Backend and floor-plan service are separate PyInstaller onedir bundles. Builds use unique release directories and finite frozen self-tests. Floor-plan requests use restricted Electron IPC to loopback so packaged file-origin UI does not depend on development CORS.

## Architecture and prerequisites

Current stack: Electron 28, React 18, TypeScript, Vite 5, Python 3.10+ and .NET 8. The active Tobii integration is Interaction Library, not an assumed Stream Engine path merely because those interop files exist.

Tobii helper TCP 5555 → Python asyncio backend WebSocket 8765 → React/Electron. Embedded browsing uses Electron BrowserView. Floor-plan service starts lazily on loopback port 5050. Speech uses Windows SAPI5 with browser fallback. Offline prediction assets, guardrails and personalization must remain intact; Datamuse stays off by default. Do not send messages, gaze traces or learned vocabulary to external services as part of testing.

Documented development baseline: Git, Node 22 x64, Python 3.12 x64 and a serviced .NET 8 SDK, plus Tobii Experience recognizing/calibrating the tracker. Verify actual installed versions and compatibility instead of copying macOS node_modules, virtual environments, native binaries or build output. Do not blindly perform major dependency upgrades during hardware diagnosis.

## Validation sequence

1. Inventory Windows edition/build, architecture, toolchain, tracker/software versions, displays, resolution/scaling, permissions and occupied ports. Read the scripts before executing them. Use a normal user terminal; do not assume administrator rights are needed.
2. Parse all PowerShell scripts using scripts/windows/Test-Scripts.ps1 in Windows PowerShell 5.1. Run setup.bat and check-windows.bat. Inspect each exit code and log; stop dependent steps on failure and fix the cause. For explicit simulation use setup.bat -Simulate, check-windows.bat -Simulate and start-dev.bat --simulate. Hardware startup uses start-dev.bat. Do not use --skip-build as proof of a fresh build.
3. Run npm run build, npm run build:electron, npm run check:dwell-groups, npm run check:gaze-safety, npm run check:browser-gaze-safety and npm run check:browser-cursor. Run node scripts/check-zone-board.cjs, scripts/check-dev-startup.cjs, scripts/check-floorplan-transport.cjs, scripts/check-advanced-floors.cjs, scripts/check-english-interface.cjs, scripts/check-food-content.cjs and scripts/check-tts-routing.js individually through node.
4. Use python/.venv/Scripts/python.exe for python -m unittest discover -s python/tests, scripts/windows/test_verify_windows_bundle.py, scripts/verify_windows_bundle.py source --root . and scripts/check-floorplan-floor-refinements.py. Distinguish missing training-only dependencies, skipped tests, geometry-only stubs and real runtime failures. Do not install large training stacks just to disguise an unrelated test-discovery limitation. Confirm ONNX/model loading and actual Cairo/solver rendering independently.
5. Exercise source launch/stop/restart in simulation, then with the physical tracker. Validate both keyboards, all five timing categories, phrase return, TTS, offline prediction, survey → Compass → room/floor editing → generated/exported plans and live native YouTube/browsing. Browser previews disable hardware, speech, network and file generation; they cannot validate these features. The Mac preview URL on port 5190 is a local review artifact, not the Windows launch workflow.
6. Check connected-before/after-launch, missing/invalid calibration, unplug/replug, leaving/returning, partial tracking, service interruption and sleep/resume. Invalid/old samples must never select. Measure sample age, coordinate alignment, intended and unintended selections, recovery, CPU/RAM/handles and latency under load. Report measured distributions separately from programmed dwell and onset; do not infer hardware performance from synthetic tests.
7. Check 1366×768 and 1920×1080, with 1280×720 and 1024×768 stress cases; Warm/Dark; traditional alphabet/numeric and nav shown/hidden; Zone groups/letters/expanded display. Test Windows scaling, mixed-DPI/window movement, primary-display changes and negative desktop origins. Measure actual bounds and hit targets, not screenshots alone. Do not claim Windows 10 tested if only Windows 11 was available.
8. Run build-installer.bat to produce a local test candidate. Verify resource paths, hashes and frozen self-tests. Install it and run check-windows.bat -InstalledPath with the actual installation directory. Test installed startup, hardware, speech, predictions, BrowserView and file-origin floor-plan generation. Check fresh install, upgrade, uninstall/reinstall, settings retention and a clean standard-user machine without developer runtimes. Never weaken validation to package stale or incomplete resources.
9. Exercise failure cases safely in isolated temporary fixtures: missing/wrong-architecture DLL, missing model/runtime, unavailable dependency, occupied port, failed child startup/publish, paths with spaces and invocation from another working directory. Do not mutate the real SDK installation or patient data for these tests.

## Evidence and remaining work

Previous Mac checks passed frontend/Electron builds, 11 timing/preference checks, 10 gaze-safety checks, 24 browser request/native-click checks and 19 browser replay scenarios. Zone text helpers and earlier startup, floor-plan transport, bundle-validator, English-only and food checks also passed. The latest UI matrix checked 32 traditional-keyboard states and 24 Zone states across four sizes/two themes without measured button overlap, off-screen buttons or targets below 80 CSS pixels. These are scoped historical results, not a blanket validation of all screens.

Not yet established: Windows PowerShell execution, native .NET/Tobii interoperability, dependency installation/freezing, installed-runtime behavior, real SAPI5, live BrowserView/YouTube, actual hardware accuracy/latency, Windows scaling/reconnect and clean-machine installer acceptance. The Windows CI workflow was authored but not dispatched during this local work. Check whether it has since run; a Windows Server CI result is not Windows 10/11 tracker acceptance.

Other open release work: current dependency/security review (including Electron), runtime servicing, Windows Python dependency locking/reproducibility, lint configuration, signing, third-party notices and exact Tobii DLL hosting/redistribution provenance. Retain existing distribution gates; do not fabricate approval records or infer vendor rights from the repository's license. Historical audit vulnerability counts and support dates must be rechecked before release. Reassess older non-keyboard clipping findings rather than assuming the keyboard matrix covered them.

Keep logs bounded under tools/reports, with high-frequency gaze logging off. Do not stream continuous gaze output into the agent conversation. Keep reports free of personal messages, credentials and raw biometric traces. After meaningful fixes, run focused regressions and the affected integration paths; broaden only when the change warrants it.

Deliver a concise Windows validation report with exact commit, machine/toolchain/display details, commands and exit codes, pass/fail/skip status, reproduced defects, fixes, hardware measurements and installer hashes. Update docs/windows-local-testing.md with observed results. Clearly separate automated checks, manual hardware tests and untested items. Continue useful local work until acceptance is met or a specific physical/external prerequisite prevents progress, and state exactly what is needed next.
