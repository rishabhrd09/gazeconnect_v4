# Windows production readiness and UI refinement

Current language scope: English-only. The later user request supersedes bilingual requirements in the dated review below. Translated UI blocks, language selectors and translation-edit fields are removed; old language settings normalize to English. Existing translation data remains dormant for the separately planned language feature.

GazeConnect should retain its working Tobii Eye Tracker 5 integration, familiar screens, content, and target geometry. The proposed work improves the reliability of the Windows distribution and gives the interface a calmer, more consistent appearance. A platform rewrite or a wholesale replacement of the gaze pipeline is not justified by this review.

The initial deliverable was a source review and visual proposal. The follow-up now implements the requested appearance changes and global emergency-control removal; installer and hardware transport changes remain planned. Review baseline: commit `81dcccf`, application version `4.8.0`. Work branch: `featuring/ui-design-windows-production-refinement`.

## Compass workspace and browsing refinement — 14 September 2026

This pass follows the user's request for larger, clearer Home Design and browsing controls. Room names, queue order, survey answers, map cell identifiers and the five fixed dwell durations remain intact.

- **Compass and rooms:** larger upright map labels, readable coordinates, theme-matched road and action surfaces, and eight room choices per page in the original order. Pointer and keyboard room selection work directly; READY still arms gaze. The cell editor presents split direction, six room choices at a time, proportions, walls, rotation and expansion with large stationary controls and an accessible Pause Gaze action. Covered map controls are ineligible for gaze selection.
- **Interaction corrections:** hit testing respects the topmost visible surface; cached targets are rechecked after modal/readiness changes. A direct button click cancels its pending mouse dwell to prevent a second activation. The existing reading cooldown now cancels obsolete timers on replacement and unmount.
- **Advanced Map and plan viewer:** contextual tools replace crowded stacked panels. Plan details use large paging controls; image actions occupy their own rail. Ground/First Floor grids, refinements and stair layouts survive switching, saving and returning to Compass independently. The viewer rejects stale image responses and releases image URLs. The Python parser also reads per-floor refinements, retaining the legacy fallback.
- **Browsing:** Warm/Dark cards and type are consistent across the hub, YouTube, news, Quick Search and social controls. Long lists are paged with targets of at least 80px in the audited states. Corrected unstable browser-effect dependencies, social opening and Exit wiring. Native page content and browser commands remain part of the existing Electron integration.

Validation for this pass: application TypeScript/Vite build; 10 fixed-timing/preference checks; 12 floor/draft checks; four real Python parser checks; 13 browser cursor replay scenarios; 13 modal/hit-testing cases; click/dwell duplicate-activation checks. A 48-state browsing audit covers Warm/Dark at 1366×768 and 1920×1080 with no clipped or sub-80px controls. Direct in-app preview checks cover room paging, split confirmation, walls, rotation, expansion, floor switching and compact tools at 768px, plus the Compass grid at 1080px. Palette checks cover primary, secondary and accent text on the six shared surfaces (lowest tested pair: 4.78:1 Warm, 6.11:1 Dark); this is not a full accessibility audit.

The local preview disconnects hardware, speech, online content and file generation. Windows ET5 accuracy, native YouTube playback, Cairo drawing and installer operation need their respective runtime checks. Earlier screen captures are labelled as references; the interactive application contains this pass. The sections below retain the earlier review and its dated findings.

## Fixed timing and planning-screen follow-up — 14 September 2026

The latest user instruction supersedes the earlier timing/layout freeze for Settings, survey choices and home-planning controls. Warm and Dark remain the only themes. Existing question text, answers, board names and destination routes are preserved.

- **One selection model:** Typing 500ms; Words/suggestions 1000ms; Communication 1250ms; Navigation/choices 1500ms; Deliberate actions 2000ms. Settings shows a five-card guide. Removed the individual timing sliders, ALS/speed multipliers, unused ring-sync option, legacy size-based timing table and repeat-key acceleration. The central cursor, gaze buttons, mouse dwell, predictions, gaze toggles and native browsing use these fixed groups. Legacy custom hold values are intentionally replaced by the five times; old storage remains available for rollback.
- **Tracking safeguards:** previous onset/cooldown preferences and stage-based keyboard/browser stability values are retained internally. No Tobii DLL, C# bridge, coordinate mapping or filter coefficient changes. Smoothing has three everyday choices; legacy saved stability profiles remain selectable. Saved smoothing is reapplied on reconnect, and the unsupported old `normal` label maps to `balanced`.
- **Survey and Compass foundation:** matte surfaces, readable type, a clear question column and large stationary choice grids. Long lists show six choices per page with gaze-selectable paging. Footers now occupy their own space; they cannot cover answers. Foundation navigation stays above the questions. Selections survive page changes, Back, confirmation, summary saving and reload. Back cancels a pending 400ms answer advance to prevent delayed navigation.
- **Design Home and Advanced Map:** refined card/type treatments, neutral controls, larger floor buttons, paged room selection, and a compact action row. The expanded navigation has reserved canvas space, keeping the grid accessible. Cell identifiers and mapping coordinates retain their original meaning and order.
- **Web browsing:** retained the existing hub and toolbar arrangements with consistent matte cards, softer borders and typography. Native browsing uses the 2000ms Navigation group.

Validation: 392 survey/foundation/room-picker states across Warm/Dark and 1366×768/1920×1080 pass option preservation, minimum 80px choice/control size and clipping checks; no renderer exceptions. A separate 76-screen comparison found geometry changes limited to the intended survey, Advanced Map and Settings screens among matched controls. New timing/legacy preference regressions: 10 pass. Browser-cursor replay: 13/13 pass with the new 2000ms browser dwell (test traces updated to wait for the intended duration). Survey single/multi selection, Back, cross-page retention, save/reload, and the four timing cards pass in both themes. Existing theme migrations and mocked YouTube/Quick Search wiring also pass.

These are browser and source-level checks. Windows 10/11 with the physical Tobii Eye Tracker 5, native playback, SAPI5 and clean-machine installation still require testing. Existing Basic Needs clipping and small Spatial Keyboard targets at 768px remain separate release issues. Earlier statistics below describe the first appearance pass, before this authorized timing simplification.

Compass foundation accepts pointer and keyboard clicks immediately; READY arms gaze selection for each question. Visible guidance explains the distinction. The previous implementation incorrectly blocked direct clicks too, which was especially confusing in the muted preview. Answer buttons remount for each question so a dwell timer from the preceding question cannot carry over to a reused option. Verified direct navigation through all seven questions into the map in the in-app preview, Warm at 1080px and Dark at 768px, plus keyboard input, Back, Skip and READY target gating. Application build passes.

## Implemented follow-up — 14 September 2026

The user's latest instructions supersede the original emergency-preservation rule. The application is a communication aid, not a dependable alert system.

- **Two appearances:** Warm and Dark only, including saved-preference migration and synchronization with existing inline theme consumers. Legacy screen paint aliases cannot activate the removed modes; the unused Light/Mix stylesheet is deleted.
- **Global emergency removal:** top navigation, floating fallback, Advanced Map, hidden-navigation YouTube/web toolbars, tray action, preload event channel, dedicated speech callbacks, and unused emergency phrase settings. Care phrases and their dwell categories remain unchanged. The separate Alert Mode board is retained pending clarification, including its existing SOS phrase; this is not an assertion of alert reliability.
- **Home:** date/time occupies the former left navbar area. The four care cards retain their exact phrases, order, position and dwell values, with neutral surfaces and subtle text and border accents that still reflect saved care-card color choices. Main tiles use consistent matte surfaces. Hover/activation styling no longer scales Home targets.
- **Appearance:** muted navy/ivory Dark, warm paper/olive Warm, fine borders, reduced shadows, and bundled Manrope for selected interface labels. The keyboard keeps its established font rules. The font adds 24.84 kB, carries its OFL license and does not require a font service. External Google Fonts stylesheets are removed.
- **Settings and browsing:** unified theme controls and input surfaces, readable sidebar spacing, clock overlap removed from Settings, integrated web toolbar colors, dedicated emergency wiring removed. Existing navigation and web command handlers remain in place.
- **Efficiency and documentation:** the clock updates at minute boundaries instead of every second; hidden clocks do not schedule updates. README is shortened and corrects unsupported medical/distribution claims. No Tobii DLL, mapping/filter coefficient, dwell default, prediction asset, installer script or backend transport is replaced in this pass.

Reference study: [GazeSpell tokens](/Users/rishabh/eye_tracking_projects/gaze-spell-desktop/app/src/ui/tokens.css), [Iris dark surfaces](/Users/rishabh/iris-desk-buddy/ui/src/styles/app.css), and [GazeCompass tokens](/Users/rishabh/eye_tracking_projects/raspberrypi5_gazecompass/ui/src/theme/tokens.ts). These informed independently implemented colors and card treatments. The original OptiKey source review is detailed below; this pass makes no claim of zero tracker error or measured lower hardware latency.

Validation uses the existing React screens at 1920×1080 and 1366×768, both themes, plus navigation and preference checks. Baseline issues include Basic Needs clipping, small Spatial Keyboard targets at 768px height, small Advanced Map controls and its clipped Generate Plan action. Settings remains a scrollable caregiver page. These are recorded release tasks, not evidence of newly achieved accessibility compliance.

### Follow-up verification

- Frontend TypeScript/Vite and Electron TypeScript builds pass.
- 76 screen states inspected: 19 components × Warm/Dark × 1920×1080/1366×768. No runtime errors, missing images, or global emergency buttons. All matched dwell attributes are unchanged. Remaining patient controls retain baseline bounds; the removed Advanced Map control leaves a noninteractive spacer. Caregiver Settings rows intentionally accommodate the revised theme selector and typography.
- Five saved-theme cases pass using the real Theme and Customization providers: Light, Mix, missing preference with either disk theme, and invalid input. Switching Warm/Dark synchronizes CSS, persistence and inline-style consumers.
- YouTube and Quick Search navigation/commands pass with a mocked Electron bridge in both themes. This verifies application wiring, not live YouTube or a native BrowserView installation.
- Existing browser cursor scenarios: 13/13 pass. Existing speech-routing checks: 17 pass. Existing OptiKey edge-stability tests: 4 pass. Existing coordinate-mapping tests: 9 pass.
- Main application JS decreases from 824.58 kB to 812.96 kB; CSS decreases from 43.82 kB to 33.58 kB. The bundled font is 24.84 kB. These are emitted build sizes, not process-memory or installer measurements.
- Existing Basic Needs clipping, small Spatial Keyboard targets at 768px height, and Advanced Map clipping/small targets remain documented. Windows native playback, SAPI5, DLL loading, reconnect, physical gaze accuracy/latency, and clean-machine installer validation remain open. No public release has been produced.

## 1. Scope and preservation contract

The primary targets are Windows 10 and Windows 11, x64, using Tobii Eye Tracker 5. macOS is a development and preview host only. A successful browser build on this Mac is not evidence that the Windows installer, native DLL loading, SAPI5 voices, or USB reconnection work.

The following are release invariants:

- Preserve every existing phrase, English/Hindi label, screen name, board name, navigation destination, card order, and saved customization. Do not replace the current AAC content with generic demonstration content.
- Preserve the tested 1920 × 1080 layout, card bounds and hit areas, except the explicitly removed global emergency controls, relocated Home clock, and the authorized survey/Advanced Map usability refinements described above. Visual refinements change paint and typography within those bounds. Font changes must pass layout comparisons because different glyph metrics can cause reflow.
- Keep the five fixed dwell groups in `src/config/dwellTimeConfig.ts`. The 14 September follow-up intentionally replaced the previous per-action defaults and repeat accelerator. Preserve unrelated tracking flags and safeguards.
- Keep main screens free of scrolling and gaze targets at least 80 × 80 CSS pixels where that is the existing patient interaction contract. Measure physical/DPI behavior on Windows as well; pixel size alone does not establish a fixed visual angle.
- Retain care-phrase content, distinguishable dwell progress, target locking, escape behavior, keyboard cooldowns, and navigation cooldowns. Remove dedicated global emergency triggers per the updated product scope.
- Offer only Warm and Dark. Migrate stored Light to Warm and Mix to Dark. Preserve personal content and other settings.
- Keep speech and local prediction available offline. Keep Datamuse off by default. Never send typed phrases, patient vocabulary, or gaze traces to an online service as a side effect of this refactor.

When an existing accessibility defect conflicts with the layout freeze, record it separately. First seek a correction that preserves the screen's arrangement and content. If that is impossible, resolve that specific conflict before changing geometry; a visual polishing pass must not quietly redesign the interface.

## 2. What was inspected and verified

The review inventoried 298 tracked files and traced the principal boundaries: Electron launch/shutdown and IPC; the C# Interaction Library helper; TCP/WebSocket transport; filtering, signal validity, dwell and prediction; the routed screens and overlays; floor-plan generation; persistence; packaging; and public documentation. Both supplied reference projects were inspected locally. This is a source review and a frontend simulation, not a Windows penetration test or clinical validation.

| Check | Baseline result | Interpretation |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed | Locked Node dependencies installed; Electron installation scripts deliberately not run on macOS. |
| `npm run build` | Passed | TypeScript and Vite production frontend build succeeded. |
| `npm run build:electron` | Passed | Electron TypeScript compiled; Windows behavior remains untested. |
| `npm run check:browser-cursor` | 13/13 scenarios passed | Existing injected-script and synthetic browser cursor safeguards have a useful baseline. |
| `node scripts/check-tts-routing.js` | All 17 checks passed | Routing covers English, Hindi, mixed-script emergency speech, mute, and WPM conversion. This does not test installed voices. |
| Python unittest discovery | 37 passed, 1 skipped, 1 loader error | The loader error is missing training-only `torch`; ONNX Runtime is also unavailable on this host. Neural inference was not validated. |
| `npm run lint` | Failed before linting | No ESLint configuration is present. This is a reproducible tooling gap. |
| `npm audit --json` | 38 reported findings: 2 critical, 29 high, 5 moderate, 2 low | Counts cover the whole installed dependency graph, including build tools. They are not 38 demonstrated exploits in the shipped app. |
| Visual matrix | 19 components × 2 themes × 2 viewports | All 76 initial states rendered without page errors or missing images; no measured control-position/size changes above 0.5 CSS px between current and proposed paint. |
| Review viewer | Passed | All 19 screen choices and gallery entries; theme/comparison switching; keyboard navigation and typing; 1366 × 768 viewport control. |
| Windows package and ET5 hardware | Not run | Requires Windows test machines and the physical tracker. |

The critical npm findings are in `shell-quote` and `tar`; direct dependencies with high findings include Electron, electron-builder, Vite and the TypeScript ESLint tooling. The audit output must be triaged by actual use and packaged reachability. In particular, Electron is listed as a development dependency but its runtime is shipped to users. An `--omit=dev` audit alone would miss that distinction. Do not use an automatic forced major-version upgrade.

The frontend build produced an approximately 825 kB minified application chunk, a separate 141 kB React chunk, and 44 kB CSS. Four emitted medical illustrations total about 2 MB; one is about 1 MB. These are file sizes, not measurements of installed size, memory, frame rate, or startup latency. Vite also emits source maps. Source maps are not secrets in an open-source product, but their distribution should be deliberate.

## 3. Findings that should shape implementation

### A. Release correctness and packaging

**A1 — An installer can succeed without the required tracker helper.** `build-installer.bat` falls through to `:skip_dotnet` when the SDK/DLLs are missing or the helper fails to publish. Its final staging check treats a missing helper as a warning. It also falls back to a framework-dependent build, contradicting the expectation of a self-contained installer. Make the ET5 release build fail with a nonzero exit unless the required helper, native dependencies, and correct runtime are staged. If a separate simulator artifact is ever wanted, give it an explicit build target and identity. [Local evidence: installer stages 2 and 5](../build-installer.bat).

**A2 — Packaged floor-plan startup is inconsistent with the bundle.** Electron's packaged path expects `resources/python/python.exe` and `resources/tools/floorplan_server.py`. The installer instead produces `GazeConnectBackend.exe`, and `package.json` only copies `python-dist` and `tobii-dist`. The packaged floor-plan service therefore cannot start from the declared artifact. Choose one supported package contract: preferably a separately frozen floor-plan service, started lazily, with the Cairo/rendering dependencies and templates it needs. Do not ship a second complete interpreter merely to paper over the mismatch without measuring the cost. [Local evidence: `startFloorplanServer`](../electron/main.ts), [resource manifest](../package.json).

**A3 — Static prediction resources need an explicit package manifest.** The PyInstaller command adds `services` and optional knowledge JSON, but does not explicitly include the ONNX model, its vocabulary JSON, or `smart_bigrams.json`. Python import discovery does not reliably include arbitrary data files. Create a checked-in PyInstaller spec with an allowlist of static assets, model hashes, and a frozen-executable self-test. Keep writable patient data entirely separate from immutable model assets. [Local evidence](../build-installer.bat), [model loader](../python/ml/inference.py), [bigram fallback paths](../python/services/word_prediction.py).

**A4 — Runtime support and dependency versions require a controlled upgrade.** Electron 28 is outside Electron's supported recent major releases. .NET 6 has reached end of support. Evaluate a supported Electron release and a supported .NET LTS against the existing Tobii Interaction binaries. Do not combine runtime migration, browser view migration, and filter tuning in one change. BrowserView is deprecated in current Electron; isolate its controller before evaluating WebContentsView. Preserve the tested helper as a comparison artifact throughout compatibility testing. [1][2][3]

**A5 — Development cleanup can terminate unrelated applications.** `start-dev.bat` kills every `electron.exe` and kills processes found on ports 5173, 5555 and 8765. Another app can legitimately own those processes or ports. Replace this with process ownership tracking and path/parent checks; report a conflict when ownership cannot be established. [Local evidence](../start-dev.bat).

**A6 — Simulation and fallback-port wiring are incomplete.** The batch launcher's `SIMULATE` variable changes its messages and helper-build path, but Electron does not consume it or append Python's `--simulate` argument. Python can select another WebSocket port, while the renderer defaults to 8765 with no discovered-port handshake. Propagate explicit mode and startup endpoint through Electron's managed launch contract. Do not adopt whichever unauthenticated service happens to answer on a scanned port. [Local evidence](../start-dev.bat), [Electron process arguments](../electron/main.ts), [WebSocket defaults](../src/hooks/useWebSocket.tsx), [server startup](../python/main.py).

### B. Security and privacy boundaries

**B1 — The local services lack a complete trusted-client boundary.** The main backend is bound to loopback when Electron starts it, which is good. Its WebSocket server does not configure an origin allowlist or session authentication, however, and messages can change settings, invoke speech/automation and write data. The floor-plan server binds `0.0.0.0`, uses broad CORS patterns and returns stack traces from its global exception handler. Bind all local services to loopback; add per-launch authentication, bounded messages, schema checks and exact origin rules. Origin checks supplement authentication; they do not replace it. [Local evidence](../python/main.py), [floor-plan server](../tools/floorplan_server.py).

**B2 — Electron has good isolation defaults in the embedded browser, but gaps remain.** The BrowserView uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The main renderer explicitly disables its sandbox; IPC handlers generally ignore sender identity; no production CSP or explicit permission handlers were found in the inspected startup paths. Add a single checked IPC boundary, validate navigation URL schemes and popup destinations, and deny unnecessary remote-page permissions. Replace the broad renderer-facing `webview.executeJs(code)` method with typed commands where practical. Preserve YouTube's working user-gesture behavior inside those commands. [Local evidence](../electron/main.ts), [preload](../electron/preload.ts), [HTML entry](../index.html), [1].

**B3 — Network fetches and automation need bounded input handling.** The article service accepts a URL and follows redirects. Validate schemes, destinations and every redirect; restrict private-address fetches where not a documented local feature; cap response size and parse time. For automation, `requires_confirmation` currently only invokes confirmation if a callback exists. A confirmation-required action should refuse to execute when that callback is absent. Keep these fixes separate from styling. [Local evidence](../python/services/article_service.py), [automation dispatch](../python/automation/automation.py).

**B4 — Public repository cleanup must distinguish static content from personal/runtime artifacts.** Tracked files include two session console captures totalling about 4.8 MB, temporary diffs, error captures, `src/screens.zip`, and source-asset ZIPs. Inspect their provenance and references, then remove confirmed generated/duplicate files from the current tree. Run a filename-and-secret scan of history before making the repository public; deleting today's file does not erase earlier commits. Do not rewrite history or delete shared history automatically. Preserve model/vocabulary assets, useful technical documentation, licenses, fixtures, and any uniquely referenced artwork.

**B5 — DLL redistribution rights must be established for the actual files.** The app is MIT-licensed, while the six vendored Tobii binaries are third-party software. The running C# helper uses `Tobii.Interaction.Host` and `LightlyFiltered`, not the unused `TobiiInterop` wrapper. Historical EyeX terms and present Tobii development terms differ. Inventory binary versions, hashes, source and applicable agreements; include authorized notices and redistributables. If rights cannot be established, publish code and documented local setup without distributing those DLLs. This remains a distribution question; the working local integration should be preserved. [Local evidence](../tobii-helper/TobiiGazeHelper/Program.cs), [project references](../tobii-helper/TobiiGazeHelper/TobiiGazeHelper.csproj), [4][5][6].

### C. Latency, reliability and gaze correctness

**C1 — The C# callback performs a synchronous network write.** `OnGazeData` serializes each sample and calls `_stream.Write` inside the tracker callback. A slow or dead client can stall this callback. It also looks up primary-screen dimensions on every sample, logs coordinates every 60 samples regardless of `Verbose`, and overwrites a previous client without explicit disposal. Move delivery to one bounded, latest-sample writer; dispose replaced clients; add cancellation and orderly shutdown. Preserve sample ordering and an explicit validity state; do not use an unbounded queue. [Local evidence](../tobii-helper/TobiiGazeHelper/Program.cs).

**C2 — A latest-frame slot exists in Python, but outbound tasks are unbounded per slow client.** `_gaze_broadcast_loop` consumes the latest frame and calls `asyncio.create_task(client.send(msg))` repeatedly. That does not wait for network writes, but it can build a backlog and leave asynchronous failures unobserved. Use one sender per client, a one-frame replacement slot for gaze, and a separate bounded reliable queue for control messages. A slow diagnostic client must not delay the patient renderer. [Local evidence](../python/main.py).

**C3 — The advertised neural timeout is not a preemptive deadline.** The predictor calls ONNX synchronously, then checks elapsed time. `_get_predictions` is dispatched synchronously from the async message handler. A long inference can therefore occupy the same event loop that handles gaze. Put prediction work behind a bounded worker with serialized ownership of recurrent state and patient learning. Return local results promptly and discard stale completions by request ID. A timeout must not spawn unlimited work in the background. Keep guardrails on every result path and retain the current ranking behavior in regression fixtures. [Local evidence](../python/main.py), [prediction call](../python/services/word_prediction.py), [elapsed-time check](../python/ml/inference.py).

**C4 — Coordinate space and time should become explicit protocol data.** The helper divides coordinates by `GetSystemMetrics(0/1)` and uses system DPI awareness; Python applies fixed edge expansion; React maps into its viewport and applies further smoothing/snapping. This needs tests across display scaling, fullscreen/windowed mode, negative desktop origins, and tracker-mounted secondary monitors. Add explicit pixel units, calibrated-display identity/bounds, sequence number, validity and timestamp units while supporting the old message version. Use monotonic clocks for local durations; do not compare unrelated monotonic epochs between processes. [Local evidence](../tobii-helper/TobiiGazeHelper/Program.cs), [mapping](../python/main.py), [renderer cursor](../src/components/core/GazeCursor.tsx), [7].

**C5 — Filter tuning needs evidence before changing defaults.** Existing safeguards include edge passthrough, signal conditioning, blink/stale pauses, fixation progress retention, raw-gaze lock escape, navigation pauses and browser reset gates. Retain all of them. Measure total sensor-to-render age, settle time, wrong-target activation, correction rate and dropout recovery before trying fewer smoothing stages. Lower cursor jitter alone does not prove better accuracy. A cursor can be extremely stable while locked to the wrong target.

**C6 — Process supervision needs an owned lifecycle.** Check ready/failed handshakes, expected helper identity, restart backoff and cancellation of scheduled restarts when quitting. Distinguish hardware absent, driver unavailable, backend connecting and simulation. Ensure reconnection resets stale gaze and dwell state, while preserving text and customization. Limit diagnostic logging, reuse existing bounded telemetry, and never record raw coordinates continuously by default.

### D. UI and accessibility findings

The current theme system combines central tokens, two override stylesheets and many per-screen inline colors. This explains why a token change alone cannot give every screen the same appearance. `index.html` also requests seven Google Fonts families, while some components request Atkinson Hyperlegible Next, which is not included in that request. Standardize the final offline font stack and remove unused font downloads after inventory, not by blindly replacing every font declaration.

The screen simulation exposed existing issues that should be tracked outside cosmetic changes:

- Basic Needs renders lower cards beyond the visible viewport at both tested heights. It currently gives individual cards narrow default widths inside a much wider grid.
- Advanced Map's “GENERATE PLAN” target extends beyond the bottom at 768 px height in the initial preview.
- Settings contains many small, off-screen controls and explicitly marks its main panel as gaze-disabled/caregiver-only. That is a deliberate implementation choice and a mismatch with the broad “all UI gaze accessible” claim; document it accurately, then decide any patient-access expansion separately.
- Keyboard starts with navigation hidden. Preserve its existing restore-navigation and gaze-toggle paths. The updated product intentionally has no global emergency trigger.
- Alert Mode hardcodes a dark surface even when the warm appearance is selected. The visual proposal demonstrates a warm surrounding surface with the same high-emphasis alert cards; functional behavior is unchanged.

These are browser/source findings. Confirm their exact behavior with Windows fonts and DPI. Keep their fixes individually reviewable and preserve all labels and screen arrangements.

## 4. Visual direction and screen simulation

The proposal uses a restrained paper-and-charcoal palette: near-flat surfaces, quiet boundaries, clear readable text and a consistent olive brand accent. Gaze selection keeps its established teal emphasis, and urgent actions keep their red/maroon meaning. Existing card dimensions, radii, icons, labels, spacing, and content remain the starting point.

GazeSpell's useful design lessons are its almost continuous page/card color, absence of card shadows, limited typography, and simple botanical mark with a serif wordmark. The proposal reuses the requested GazeSpell mark in GazeConnect's existing noninteractive brand slot, retaining the GAZE CONNECT name. Confirm the artwork's project provenance before including it in a public release. No OptiKey code or artwork was copied into this proposal.

| Token role | Proposed warm | Proposed dark | Purpose |
|---|---|---|---|
| Page | `#F9F3EB` | `#171917` | Quiet primary background |
| Ordinary card | `#F7EFE5` | `#1D201D` | Low visual separation; same large target |
| Group/panel | `#F5ECE1` | `#1A1D1A` | Gentle hierarchy |
| Decorative boundary | `#DFD4C5` | `#363D36` | Structure without heavy boxes |
| Primary text | `#272D27` | `#F0EFE8` | High contrast, neutral ink |
| Secondary text | `#5C6457` | `#B7B9AC` | Readable supporting information |
| Brand/icon accent | `#596942` | `#B6C29B` | Consistent visual identity |
| Gaze selection | `#087B6E` | `#2DD4BF` | Strong action feedback against each theme |

These colors are a proposal, not a blanket WCAG conformance claim. Verify text contrast against the actual composite background: at least 4.5:1 for ordinary text and 3:1 for qualifying large text. Essential control/state indicators need adequate non-text contrast. A quiet decorative border is acceptable only when it is not the sole way to identify the control or its state. [8][9]

Use Segoe UI on Windows for the interface, with tested Hindi fallbacks such as Nirmala UI and optionally a licensed, bundled Noto Sans Devanagari. Evaluate a bundled accessibility font only if it improves reading without changing line breaks. Restrict serif typography to the brand. Keep existing size tokens initially; prefer medium/semibold weights over heavy all-purpose bold. Preserve generous existing label sizes. Apple's guidance supports legibility, clear hierarchy and a small number of typefaces, not importing Apple-only fonts or translucent/glassy treatments into this Windows app. [10]

### Screen-by-screen application

| Existing component | Proposed visual treatment | Specific regression focus |
|---|---|---|
| Home | Near-flat ordinary tiles, unified muted icons, calmer wordmark, readable “Daily Care” sublabel | Exact three-area arrangement, care phrases, gaze toggle |
| Keyboard | Matte keys and message surface, stronger text hierarchy, remove decorative shadow | Key bounds, shift/symbol layouts, predictions, repeat cadence, hidden-nav restore path |
| Spatial Keyboard | Apply the same text/surface tokens to existing zones | Zone order, two-stage selection and return behavior |
| Phrases | Quiet sidebar and phrase cards; preserve selected category emphasis | Category order, phrase wording, bilingual labels |
| Daily Assistance | Flat category cards with existing illustrations and urgent color meaning | Four category bounds, subboards, urgency dwell categories |
| Feelings | Neutral surfaces and consistent label typography | Existing emotion content and selection |
| Basic Needs | Same palette and typography; geometry defect separately tracked | Preserve every phrase while resolving clipping without a silent redesign |
| People | Consistent card boundary and typography | Names, relationships, custom phrases and saved edits |
| Activities | Match Phrases hierarchy and surfaces | Existing media/Alexa actions and navigation |
| Quick Words | Reduce decorative depth while preserving semantic grouping | Inject-versus-speak mode and return screen |
| Web Browsing | Matte hub tiles and toolbar; preserve external websites' own content | Browser lifetime, gaze overlay, URL/search input, YouTube commands |
| Design Home | Flat large entry cards, clear heading/subheading hierarchy | Survey and Compass destinations unchanged |
| Floor Plan Survey | Consistent question and option surfaces | All question text, progress and data persistence |
| Compass Map | Quiet outer chrome while retaining room, grid and direction distinctions | Target mapping, placement, orientation, generation |
| Advanced Map | Same map tokens and restrained sidebar | Existing placements, refinement controls, 768 px clipping |
| Settings | Consistent panel typography and surfaces | Caregiver-only sections accurately documented; navigation remains gaze-accessible |
| Customize | Match Settings without altering editor structure | Import/export, unsaved changes, schema validation, backups |
| Alert Mode | Theme-aware surroundings, prominent existing urgent cards | Locked/unlocked home behavior, automatic gaze enable, current dwell |
| Calibration | Include its existing presentation in visual review | It is not routed today; do not enable or replace calibration as a cosmetic change |

The interactive review includes all 19 components, warm/dark comparison, 1920 × 1080 and 1366 × 768 viewports, a smaller stress viewport, and the Hindi toggle. It uses an isolated copy of the existing React application. Local navigation and panels work; speech, hardware, backend requests, external pages and floor-plan generation are deliberately disconnected. Its “Connecting…” indicator is the existing offline state, not a simulated hardware success. The gallery provides initial-state screen captures. The automated 76-case matrix covers warm/dark and default labels; Hindi, the stress viewport, and deeper panel states are available for exploration but have not all received the same automated coverage.

The outer viewer may scale the preview to fit the available screen. That scaling is for design review and is not an application layout change. Windows font rasterization and actual DPI need separate checks. Initial-state coverage does not establish that every modal, long translation, custom record or online page fits.

## 5. Lessons from OptiKey 3.2.5

The supplied OptiKey source has a small provider interface (`IPointService`), a live-point stream with freshness handling and replay of one latest value (`PointServiceSource`), configurable smoothing, and distinct point/key fixation trigger implementations. Its key fixation trigger supports per-key incomplete-progress storage with expiry and configurable lock-on when resuming. Its Tobii service also separates the device-specific stream from the trigger consumer. These are useful architectural lessons. [11]

Apply those lessons through independently written GazeConnect interfaces and tests:

1. A provider produces timestamped observations and health, with a declared coordinate space. The provider does not decide which card to click.
2. Signal conditioning owns validity, gaps and freshness. Display hold during a short gap must not turn a stale point into evidence for a completed dwell.
3. Coordinate conversion happens in a documented place. Filtering does not hide a display-mapping error.
4. Target selection and dwell completion have one authoritative state machine per interaction surface. Pause, resume, expiry, navigation and repeat rules are explicit.
5. Progress retention only resumes the same logical target, within its expiry, while permitted by current navigation/lock state. Cross-target carryover is prohibited.
6. A deterministic replay harness compares changes using synthetic and authorized real-device traces. Release defaults change only after Windows A/B testing.

The GazeConnect class named `OptiKeyGazeFilter` and its four-zone behavior are not proof that it exactly implements upstream OptiKey 3.2.5. The inspected upstream Kalman implementation uses adaptive process noise and optional weighted recent samples; blindly importing its constants would not account for this project's multiple filter layers and coordinate transformations.

OptiKey's supplied license is GPLv3; this repository declares MIT. The proposed work uses general architecture/behavioral lessons and independently specified regression tests, with no source transplantation. Existing code that cites OptiKey should receive a provenance review before public distribution. Merely renaming copied code would not resolve licensing. This plan does not assert a legal clearance. [11][12]

## 6. Implementation sequence

Each stage should be a small set of reviewable commits on the new branch. Do not squash runtime upgrades and gaze changes into the same change. Preserve a known-working Windows package for rollback.

| Stage | Concrete deliverables | Exit gate |
|---|---|---|
| 0. Baseline and visual decision | Screen/content/target snapshots; exact version inventory; baseline Windows timing and startup measurements; review this visual proposal | Current app recorded at 1080/768 heights; known working tracker package retained |
| 1. Correct distribution | Reproducible Windows build inputs, explicit backend/floor-plan specs, model assets, complete helper checks, runtime path contract | Installer fails on missing required artifacts; clean Windows install works without development tools |
| 2. Close trust boundaries | Loopback services, session authentication, input schemas, sender validation, URL/permission policy, sandbox/CSP, safe process ownership | Unauthorized clients/IPC rejected; normal speech, browser and gaze flows still work |
| 3. Supported runtimes | Staged Electron/build-tool updates; .NET/Tobii compatibility spike; controlled browser-view migration if needed | Same Windows ET5 replay/hardware and YouTube results; no silent driver/library replacement |
| 4. Apply visual tokens | Central theme paint tokens, offline typography, brand refinement, flat card surfaces, per-screen residual-color cleanup | Same content and control geometry; contrast review; both themes; no regressions in dwell affordances |
| 5. Transport and scheduling | Nonblocking C# sender, bounded Python writers, prediction worker, owned restart lifecycle, accurate status/timestamps | No stale backlog; slow client/inference does not stall gaze; reliable reconnection |
| 6. Measured gaze improvements | Provider contract, mapping tests, filter-stage instrumentation, one experimental optimization at a time | Same or fewer unintended actions, improved measured response, preserved communication/dwell behavior |
| 7. Public documentation and cleanup | Concise README, focused onboarding/architecture/release docs, dependency notices, contribution/security guidance, verified file cleanup | Fresh contributor follows docs successfully; no runtime/patient data in release or tracked tree |
| 8. Windows release candidate | Signed installer where available, checksums, release notes, dependency inventory, clean-install and soak evidence | Windows 10/11 acceptance matrix complete; unresolved blockers stated; release approval applies to a concrete package |

Security and packaging changes can proceed independently of the visual choice. Experimental gaze behavior remains behind existing-style feature flags and off by default until validated; visual changes do not modify those flags. No public release, merge, historical deletion or hardware calibration overwrite is part of this first review deliverable.

### Proposed code boundaries

Refactor by extracting tested interfaces from the current implementation, not by moving every file at once:

- Electron: `processSupervisor`, `runtimePaths`, `ipcValidation`, `browserSession`, `youtubeCommands`, `storage`. Existing preload method names stay compatible until callers migrate together.
- Python: `gazeTransport`, `gazePipeline`, `clientSession`, `predictionWorker`, `speechService`, `storage`. One owner per mutable state machine; bounded channels between owners.
- C#: a tracker source using the existing Interaction Library, a sample data contract, and a bounded transport writer. Keep `LightlyFiltered` unchanged initially.
- React: semantic theme tokens, typed navigation IDs, screen-specific style adapters and reusable passive surfaces. Retain `GazeButton`'s target attributes and `GazeCursor`'s authoritative dwell semantics.

## 7. Performance and reliability measurements

Establish the baseline on the user's working Windows laptop and one clean Windows 11 machine. Record tracker model, display resolution/scaling, app mode, power state and exact build. Report median, p95 and p99, not just a best-case mean.

| Measurement | Instrumentation | Acceptance direction |
|---|---|---|
| Sensor arrival → helper send → Python receive → renderer receive → next paint | Sequence IDs and explicit timestamp units; estimate clock offset if comparing processes | No increasing queue age; improved software contribution without a claimed zero hardware latency |
| Fixation jitter / settle time | Replayed targets plus center/edge/corner observations | Lower jitter only counts as a win when settle time and target accuracy remain acceptable |
| Unintended activations | Controlled sessions, repeat/correction records, target-transition traces | No regression; zero stale/blink-driven activations in deterministic tests |
| Dropout recovery | Blink, look-away, unplug/replug, driver restart, sleep/wake | No click from held samples; prompt clear recovery; patient text preserved |
| Prediction cost | Same corpus, cold/warm caches, neural available/unavailable | Gaze event loop stays responsive; stale requests ignored; guardrails and personalization retained |
| App cost | Process-tree CPU, working set/private bytes, handles, thread count, startup-to-ready | Compare against baseline; explain any increase; lazy floor-plan service does not run during normal AAC |
| Browser longevity | Repeated open/back/close, YouTube SPA navigation and long viewing sessions | No accumulating BrowserViews, timers, observers or script promises |
| Distribution cost | Compressed installer, installed bytes and startup extraction time | Remove verified redundancy; compare PyInstaller one-file versus one-directory empirically |

Suggested initial investigation thresholds, not promises: software work within a 16.7 ms render budget where feasible, no steady-growth send queue, no continuously rising idle memory after warm-up, and no measurable p95 degradation during speech or prediction. Hardware sampling and the deliberate dwell duration are separate from software latency. Do not claim a universal ET5 frequency or accuracy from old comments mentioning 33, 66 or 133 Hz.

## 8. Windows validation matrix

Run the following on Windows 10 x64 and Windows 11 x64. Record exact editions/builds and whether Windows security servicing is current. Windows 10 compatibility remains a product goal, but it is distinct from Microsoft's operating-system support lifecycle. Avoid an unqualified “all Windows 10/11 versions supported” statement. [13]

- Display: 1920 × 1080 at 100%; 1366 × 768; 1080p at 125%, 150% and 200%; windowed/fullscreen; monitor move; primary/secondary tracker display; sleep/wake. At large scaling factors, document available CSS viewport rather than assuming it remains 1080 pixels high.
- Input: ET5 calibrated in Tobii Experience; no tracker; USB disconnect/reconnect; driver unavailable; frozen/invalid/NaN/infinite sample; clock adjustment; rapid target changes; edge/corner acquisition; patient gaze disabled; explicit mouse simulation.
- Interaction: every routed screen; quick-word injection and return; keyboard text persistence; focus and alert lock/unlock; absence of global emergency controls with hidden nav and overlays; click only once per intended completion; selected content unchanged.
- Speech: SAPI5 available/unavailable; English/Hindi/mixed utterances; missing Hindi voice; offline; stop/interruption; muted volume retains its documented behavior. No duplicate speech on reconnect.
- Web: YouTube search/play/pause, seek/volume, fullscreen exit, ads where the controls are present, Shorts if supported, consent dialogs, back/forward and SPA navigation; page close; renderer crash; network loss; zoom. Synthetic replay passing does not prove today's YouTube DOM behavior.
- Package: install in a path containing spaces and non-ASCII characters; standard user; fresh machine without Node/Python/.NET SDK; upgrade over an existing install; corrupted settings; disk full; antivirus scan; uninstall with a deliberate data-preservation policy.
- Soak: use `tools/run_soak_monitor.ps1` and the existing storage guide. Start with a shorter smoke session, then a multi-hour representative session including browsing, speech, idle and reconnection. No continuous raw-gaze console stream.

Add Windows CI for TypeScript, configured lint, deterministic Python tests, browser replay, package asset checks and a helper build against authorized dependencies. Separate training-only tests from runtime tests so contributors do not need PyTorch just to validate AAC changes. Add native hardware testing as a documented release gate; CI cannot simulate the physical ET5 optics.

## 9. README and repository cleanup plan

Reduce the README to a self-sufficient entry point, approximately 120–180 lines where practical:

1. What GazeConnect does, Windows/ET5 focus, English/Hindi and offline communication.
2. Release status with the actual tested version and a verified GitHub Releases download link when an installer is available.
3. End-user installation: Windows x64, Tobii Experience/driver and calibration, launch, gaze toggle, caregiver controls and the limits of spoken assistance phrases.
4. Source setup: exact supported toolchain, clone, `setup.bat`, hardware/simulation launch, frontend-only preview and checks.
5. One architecture diagram: ET5 → Interaction Library helper → Python → React/Electron; lazy floor-plan service and embedded web boundary.
6. Development/build/contribution links, persistence location and backup basics.
7. Concise known limitations, tracker DLL licensing/third-party notices, MIT license for project code.

Move detailed filter equations, historic fixes and learning material behind focused documentation links. Retain useful explanations rather than deleting them wholesale. Remove career/interview material from the product's primary documentation path. Fix claims that do not match the code: active bridge technology, unrouted calibration, simulation forwarding, installer driver prerequisites, unconditional offline operation, universal bilingual labels, and assertions of clinical/medical-grade certification or fixed performance without supporting evidence.

Add small `CONTRIBUTING.md`, `SECURITY.md`, and `THIRD_PARTY_NOTICES.md` files, a Windows issue template requesting versions/DPI without private phrases, and a release checklist. Keep the product free/open source; do not add analytics, paid services or an account requirement.

Candidate deletions are reviewed using an import/reference/build search before removal: `session-A-console.txt`, `session-B-console.txt`, `tmp_diff*.txt`, `errors.txt`, `ts_error.txt`, archived source ZIPs and duplicate unused assets. Preserve any unique originals until usage is established. Add ignore rules for the specific generated artifacts that remain, and use explicit package allowlists to prevent patient data from entering the installer.

## 10. Future eye-tracker support

Define a provider-neutral observation contract now, implemented by the working ET5 bridge first. It should declare provider/version, coordinate space, calibrated display, sequence/time units, validity, optional quality data and health events. Capabilities should distinguish calibration support, binocular validity, sample rate reporting and head-pose availability; never fabricate confidence `1.0` as a measured quality score.

Later providers can include other authorized hardware and a separate webcam service. Each gets its own calibration/profile and acceptance thresholds while sharing the UI, target selection, dwell rules and tests. Webcam uncertainty and sampling characteristics differ from ET5; ET5-tuned thresholds must not be silently reused. Camera libraries and models should not inflate the ET5 installer before that feature is requested and validated.

## Sources and evidence

Local links above point to the reviewed project source at the baseline. Observations are distinguished from planned fixes and untested hypotheses. Public sources below were consulted for current platform guidance; exact patch versions and licensing terms should be rechecked when producing a release.

1. Electron, [Security](https://www.electronjs.org/docs/latest/tutorial/security). Isolation, sandboxing, permissions, CSP, navigation and IPC sender guidance.
2. Electron, [Electron Releases](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) and [BrowserView](https://www.electronjs.org/docs/latest/api/browser-view). Supported release policy and API deprecation.
3. Microsoft, [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core) and [Install .NET on Windows](https://learn.microsoft.com/en-us/dotnet/core/install/windows). Runtime and OS support are separate compatibility constraints.
4. Tobii, [The Tobii Eye Tracking SDK](https://developer.tobii.com/eyex-sdk-/). Historical SDK product context.
5. Tobii, [Gaze Interaction SDK License Agreement, November 2015](https://developer.tobii.com/wp-content/uploads/2015/11/Tobii-EyeX-SDK-License-Agreement.pdf). Historical terms, not automatic authorization for the repository's binaries.
6. Tobii, [Software downloads](https://developer.tobii.com/software-downloads-test/). Current getting-started/distribution distinction; applicability requires the actual binary agreement.
7. Microsoft, [High DPI desktop application development on Windows](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows). DPI awareness and coordinate behavior.
8. W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Text contrast and accessibility criteria.
9. W3C, [Understanding Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Essential versus decorative visual boundaries and state information.
10. Apple, [Typography](https://developer.apple.com/design/human-interface-guidelines/typography). Legibility, font weights, hierarchy and limiting typefaces.
11. Supplied local `OptiKey-3.2.5`: `Services/IPointService.cs`, `Services/PointSources/TobiiEyeXPointService.cs`, `Observables/PointSources/PointServiceSource.cs`, `Observables/TriggerSources/PointFixationSource.cs`, `Observables/TriggerSources/KeyFixationSource.cs`, `DataFilters/KalmanFilter.cs`, under `src/JuliusSweetland.OptiKey.Core`. Local source inspection; no binary/hardware comparison run.
12. Supplied local `OptiKey-3.2.5/LICENSE.txt` (GPLv3) and this project's [LICENSE](../LICENSE) (MIT).
13. Microsoft, [Windows 10 release information](https://learn.microsoft.com/en-us/windows/release-health/release-information). Windows 10 reached general end of support on October 14, 2025; servicing depends on the edition/program.
14. Supplied local `gaze-spell-desktop/app/src/ui/tokens.css`, `HomeSpellPage.module.css`, `GazeSpellLogo.tsx`. Source for the reference palette, flat card treatment and requested brand mark. Source comments' own measured/provisional distinctions were retained.
15. Review-generated build, test, npm advisory and screen-audit outputs. The interactive review directory contains `screen-audit.json`, `npm-audit.json`, captured screens and a reproducible local viewer. Npm findings are a dated advisory snapshot, not a completed exploitability assessment.
