# Claude Handoff Prompt: Improve Embedded Browser Eye-Gaze Accuracy

You are auditing and improving **GazeConnect Pro**, a production medical-grade AAC app for ALS/MND patients using a Tobii Eye Tracker 5. The main app screens already have a good eye-gaze experience. The weak area is the embedded web browsing experience inside `WebBrowsingScreen`, especially YouTube and Quick Search / general browser pages.

Your task is to make the **in-browser cursor gaze experience** feel as accurate, stable, smooth, and safe as the rest of the app, while **not disturbing any outside-app gaze behavior**.

## Project Context

- Stack: Electron 28 + React 18 + TypeScript + Vite 5.
- Embedded browsing is implemented with an Electron `BrowserView`.
- The main app uses `GazeButton` and `GazeCursor` for normal app screens.
- The embedded browser uses a separate web gaze path:
  - React sends gaze coordinates from `WebBrowsingScreen.tsx`.
  - Electron receives them via `webview:updateGaze`.
  - Electron injects/runs browser cursor logic from `electron/browser/browserGazeController.ts`.
  - Clicks into the BrowserView are sent through Electron input events or trusted JS commands.
- Target user: ALS/MND patient using gaze only. No click, no drag/drop.
- Medical safety requirement: avoid accidental clicks, wrong-target clicks, flicker, stale target lock, or post-navigation double-fire.

## Hard Guardrails

Do not break the existing outside-screen gaze experience.

Do **not** modify these files unless you find a verified high-severity bug and explain why first:

- `src/screens/KeyboardScreen.tsx`
- `src/components/core/GazeButton.tsx`
- `src/components/core/GazeCursor.tsx`
- `src/config/dwellTimeConfig.ts`
- `python/**`
- `tobii-helper/**`

Do not rewrite the app architecture. The dual gaze architecture is intentional:

1. Main app screen dwell: `GazeButton` / `GazeCursor`.
2. Embedded browser dwell: BrowserView injected cursor logic.

Your changes should be targeted to the embedded browser path.

## Preferred Allowed Scope

Most useful files to change:

- `electron/browser/browserGazeController.ts`
- `electron/browser/browserDiagnostics.ts`
- `electron/browser/youtubeController.ts`
- `electron/main.ts`, but only `webview:*` IPC / BrowserView code
- `electron/preload.ts`, but only `webview:*` API exposure
- `src/screens/WebBrowsingScreen.tsx`

Possibly allowed, with caution:

- `src/utils/gazeSnapping.ts`
- `src/contexts/RealGazeContext.tsx`, only for read-only understanding unless there is a web-only mapping bug
- `src/hooks/useWebSocket.tsx`, only for read-only understanding unless there is a web-only timestamp/coordinate bug

## Goal

Improve the embedded web cursor experience for:

1. YouTube video pages, recommendations, search results, skip-ad/play/pause controls.
2. Browser Quick Search pages and general web results.
3. Dense pages where native links/buttons are much smaller than AAC targets.
4. Dynamic web pages where elements shift, scroll, lazy-load, or route-change while the patient is dwelling.

The final result should preserve:

- Accurate target selection.
- No cursor chasing moving DOM nodes.
- No wrong click after scroll/navigation.
- No double-fire after browser click.
- Smooth single dwell visualization.
- No regression on Home, Keyboard, Medical, Basic Needs, People, Phrases, or other outside screens.

## Important Existing Specs

Read these included docs before proposing code:

- `docs/v17.15-stable-web-cursor-spec.md`
- `docs/v17.16-watch-mode-spec.md`
- `docs/v17.17-placeholder.md`

If parts of v17.15 are already implemented, verify them rather than duplicating them. If they are incomplete, finish them in the smallest safe patch.

## Investigation Questions

Please answer these from code before changing anything:

1. How do gaze coordinates move from React to Electron to the BrowserView?
2. Are BrowserView-local coordinates always correct after zoom, resize, scrolling, title bar offsets, and Windows DPI scaling?
3. Does `webview:updateGaze` use fresh gaze samples, or can stale samples continue dwell after navigation or scroll?
4. Does the injected cursor choose candidates from visible/interactive DOM regions, or from oversized containers?
5. On YouTube sidebar cards, does snapping anchor to the useful thumbnail/title region or to the full renderer card?
6. During route change, scroll, mutation, or lazy loading, is existing posterior/dwell state invalidated fast enough?
7. Are post-click cooldowns blocking immediate second clicks inside BrowserView?
8. Does Quick Search rely on tiny native web targets, and would an app-owned large result overlay improve accuracy?
9. Is there any double dwell engine running on the same embedded browser target?
10. Are outside-app `GazeButton` and `GazeCursor` paths untouched?

## Concrete Improvement Directions

Prioritize these, in order:

### 1. Coordinate correctness

Verify BrowserView bounds, content coordinates, zoom factor, device pixel ratio, title bar offsets, and any offset correction. Add a diagnostic helper if needed. Fix only web/BrowerView mapping bugs. Do not change the global gaze filter for all screens.

### 2. Candidate stability and stale target invalidation

Ensure the injected browser cursor invalidates dwell/posterior state on:

- Scroll.
- Window/BrowserView resize.
- YouTube SPA route change.
- DOM mutation that changes target candidates.
- Candidate list churn.

Wrong clicks after target movement are worse than slower clicks. Prefer canceling dwell when uncertain.

### 3. Stable winner before dwell onset

Dense pages need a short stable-winner requirement before showing/starting dwell. Do not start dwell just because gaze crosses a candidate. Require the same winner for a few frames and a meaningful posterior margin.

### 4. YouTube target geometry

For YouTube compact/sidebar cards, snap to the union of thumbnail and title rect, not the full right-sidebar renderer box. The cursor ring should visually anchor where the patient is looking.

### 5. Watch / pause mode

When a video is playing, suppress in-video dwell so looking at the video does not accidentally click play/pause or controls. Add or complete a large gaze-accessible rail outside the BrowserView if the existing code supports it. Main app gaze controls must remain usable while web gaze is paused.

### 6. Quick Search result ergonomics

If Quick Search uses ordinary website links that are too small, propose or implement an app-owned large target overlay/list for the top results. The overlay should use `GazeButton` or the existing main-app gaze pattern, with 80px+ targets and centered dwell. Do not depend on tiny native web links for primary search-result selection.

### 7. Telemetry

Add lightweight browser-only telemetry if missing:

- frame ring
- target switch events
- onset start/cancel
- dwell commit
- route/mutation/scroll invalidation
- tracking gaps
- click residual distance

Do not spam logs continuously. Prefer an in-page `window.__gcTelemetry.dump()` API or existing diagnostics.

## Non-Goals

Do not:

- Change keyboard behavior.
- Change global dwell category defaults.
- Change the Tobii helper, Python gaze filters, or global smoothing.
- Replace the BrowserView architecture with a new webview model.
- Add cloud services.
- Add mouse-only controls for patient-critical actions.
- Make app screens scroll.
- Reduce emergency accessibility.

## Expected Deliverable

Produce one of these, depending on what you find:

1. If you are implementing: a small targeted patch plus a concise explanation.
2. If you are auditing first: a finding list with file/line references and exact proposed patches.

Either way, include:

- Root cause summary.
- Files changed.
- Why outside gaze behavior is unaffected.
- Verification run:
  - `npx tsc --noEmit`
  - any Electron TypeScript check available in this repo
  - manual test script below

## Required Manual Test Script

Run with `.\start-dev.bat --simulate` first, then with real Tobii gaze if available.

### Outside-screen regression checks

1. Home: dwell select 2 normal tiles and return home.
2. Keyboard: type `hello`.
3. Basic Needs or Phrases: select 2 phrase buttons.
4. Emergency / always-active affordance: verify it still responds.

Pass: same feel as before, no new flicker, no double-fire.

### Embedded browser checks

1. Quick Search:
   - Open Web Browsing / Quick Search.
   - Search a common query.
   - Select one result by gaze.
   - Pass: no accidental neighboring result, no dwell ring drift, no double click.

2. YouTube search results:
   - Open YouTube search.
   - Sweep gaze across several thumbnails.
   - Pass: dwell does not start during quick sweep; starts only after stable fixation.

3. YouTube sidebar:
   - Play a video so right recommendations appear.
   - Dwell the center of the second recommendation thumbnail/title.
   - Pass: cursor anchors to thumbnail/title, not far right edge; click lands on intended video.

4. Scroll mid-dwell:
   - Start dwelling on a result.
   - Scroll before dwell completes.
   - Pass: dwell cancels within about 100ms; no stale click.

5. Navigation cooldown:
   - Click a result/video.
   - Keep gaze near the old click location during route change.
   - Pass: no second click on the new page.

6. Video playback:
   - While video is playing, look inside the video frame.
   - Pass: no accidental dwell click inside video.
   - Look outside video at a large rail/control.
   - Pass: gaze controls still work.

## Files Included In This Handoff

Core prompt and project constraints:

- `docs/claude-web-browser-gaze-accuracy-prompt.md`
- `CLAUDE.md`
- `AGENTS.md`
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.electron.json`
- `tsconfig.node.json`

Embedded browser / web gaze:

- `src/screens/WebBrowsingScreen.tsx`
- `electron/main.ts`
- `electron/preload.ts`
- `electron/browser/browserGazeController.ts`
- `electron/browser/browserViewController.ts`
- `electron/browser/youtubeController.ts`
- `electron/browser/browserDiagnostics.ts`

Main gaze references, mostly read-only:

- `src/components/core/GazeButton.tsx`
- `src/components/core/GazeCursor.tsx`
- `src/components/core/GazeControlToggle.tsx`
- `src/contexts/RealGazeContext.tsx`
- `src/contexts/DwellTimeContext.tsx`
- `src/config/dwellTimeConfig.ts`
- `src/utils/design.ts`
- `src/utils/gazeSnapping.ts`
- `src/hooks/useWebSocket.tsx`
- `src/components/GlobalNavBar.tsx`

Types / supporting app context:

- `src/types/SettingsTypes.ts`
- `src/types/customization.ts`
- `src/vite-env.d.ts`
- `src/screens/ActivitiesScreen.tsx`

Existing browser cursor specs:

- `docs/v17.15-stable-web-cursor-spec.md`
- `docs/v17.16-watch-mode-spec.md`
- `docs/v17.17-placeholder.md`

