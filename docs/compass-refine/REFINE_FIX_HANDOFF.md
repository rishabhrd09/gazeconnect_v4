# Compass Refine, Outside view and first-plan speed: handoff (16 Oct 2026)

Branch `ui/aac-visual-exploration`, after commit `1263eed`. Written after the maintainer tested on the Windows
laptop: the 2D plan and the top view are good; dividing a cell and giving its halves rooms does not work as
expected; the Outside view says "Needs more free memory"; the start felt slow.

---

## The prompt (give this to the agent)

> You are working in the GazeConnect repository (Electron + React + Python, eye-gaze AAC for ALS patients) on branch
> `ui/aac-visual-exploration`. Read `CLAUDE.md`, the AGENTS.md entry "Compass map version 2 (14 Oct 2026)",
> `docs/compass-refine/IMPLEMENTATION_PLAN.md` §5, `docs/compass-refine/IMPLEMENTATION_LOG.md`, and this file.
>
> Goal: on the Windows laptop with the Tobii eye tracker, a person must be able to divide any Compass cell into a left
> and a right half and give each half the room they want, in few selections, with honest warnings instead of
> dead ends. The Outside view must be available on a normal 8 GB laptop. The first plan must open quickly while the
> Compass code stays lazy-loaded.
>
> Work in this order:
> 1. **Reproduce first.** Run the scenarios in Part 4 on the Windows laptop and record, for each, the exact text on
>    screen, the speech, and the health-log lines. Nothing is assumed fixed until it is seen working there.
> 2. **Confirm or reject each root cause in Part 3** with that evidence. If something else is broken, cross-check
>    it the same way: find the line of code responsible, reproduce it, then fix it. Report any new cause.
> 3. **Implement Part 5 phase by phase** (A, then C and D, then B after the maintainer answers the two questions
>    in B). Each change comes with its check or test.
> 4. **Verify on Windows** (Part 6) and report plainly what passed, what failed, and what could not be checked.
>
> Keep every rule in Part 7. Do not open a pull request. Commit and push only to `ui/aac-visual-exploration`, and
> only when the maintainer asks.

---

## 1. The vision

- A gaze-only Compass map: 4 × 4 cells, road at the bottom. Any cell can be **divided into exactly two halves,
  left and right**, so one cell holds two rooms (a passage beside a bathroom, a bedroom beside its toilet).
- The flow is REFINE → look at a cell → it opens large as LEFT HALF and RIGHT HALF → choose a half → choose its
  room → back to the cell → back to the map.
- There is no dragging and no further division. Nothing changes until a choice is made, every change can be
  undone, and a room is never silently removed.
- One saved plan is used everywhere. Passage is a room type.
- Living hall, dining and kitchen are open to each other, with no walls between them. A double-height living hall
  is possible.
- There are three realistic views: a 2D plan per floor, a top view per floor, and the outside with a few fixed
  angles. Downloads are PNG, PDF sheets and DXF.
- It must run well on 8 GB Windows laptops (4 GB fallback), and the drawing work must never slow down gaze.

## 2. What exists (commit `1263eed`)

| Part | Where |
|---|---|
| The plan format and its rules (one undo step per change) | `src/types/compassPlan.ts`, `src/utils/compassPlan.ts`, `src/utils/compassReducer.ts` (`placeCell`, `assignHalf`, `giveBothHalves`, `wholeOptions`, `wholeCell`), `src/utils/compassDraft.ts` |
| REFINE on the rail; focus view; room picker for a half; divided cells on the map | `src/screens/CompassMapScreen.tsx`, `src/components/compass/CompassRefineFocus.tsx`, `src/components/compass/CompassRoomPicker.tsx`, `SplitCellFace` in `src/components/ArchitecturalCell.tsx` |
| Studio (Plan, Top view, Outside, downloads, notes) | `src/components/compass/CompassStudio.tsx`, `tools/compass_*.py`, `tools/floorplan_server.py` |
| Starting and stopping the floor-plan service; saving files; the memory check | `electron/floorplanService.ts` |

What was verified:
- **Mac:** Node checks, 256 Python tests. On 16 Oct the whole Refine flow was driven by synthetic gaze through the
  real GazeCursor: every step activates, at 2.2–2.8 s per selection.
- **Windows, by the maintainer:** the 2D plan and the top view.
- **Not verified on Windows:** the Refine flow with the Tobii, and the Playwright checks.

## 3. Root causes found (16 Oct 2026)

### Refine: "choosing the rooms for the left half does not work"

**R1. SKIP throws the plot size away (confirmed).**
- The foundation SKIP stores the first option of each question: North, 20 ft wide, 30 ft deep. This overrides the
  prefilled 40 × 60 West, or the survey's answers. Code: `CompassMapScreen.tsx`, the `f-skip` handler
  (`q.options[0]`, around line 1405).
- On a 20 ft or 25 ft plot every half is 2′-0″ or 2′-7½″ clear, so every split is refused: "too narrow for any
  room. The cell stays whole." Reproduced in the browser by skipping all questions.

**R2. Most rooms are refused in a half on common plots (by design today, but too strict).**
- A new room in a half must meet its full minimum clear width (`MIN_CLEAR_IN` in `compassReducer.ts`): passage
  3′-3″, bathroom 3′-11″, kitchen 4′-11″, bedroom and dining 6′-11″, living, drawing and master bedroom 7′-10″.
- What fits in an interior half (6″ less at the plot edge):

  | Plot width | Half clear | Fits |
  |---|---|---|
  | 30 ft | 3′-3″ | passage only |
  | 40 ft | 4′-6″ | passage, bathroom |
  | 50 ft | 5′-9″ | passage, bathroom, kitchen |
  | 60 ft | 7′-0″ | adds bedroom, dining and the stair rooms |

  Outdoor uses (porch, lawn, verandah, backyard, balcony, terrace) have no minimum and always fit.
- Everything else is refused, or turned into "Use the whole cell for …", which removes the split.
- This contradicts the Phase 1 rule that a size shortfall is a note, not a block, for whole rooms.

**R3. Questions come in the wrong order (confirmed by gaze).**
- For a room that cannot fit, the person is first asked "Make a separate Bedroom 2?" and only then told it is too
  narrow: two questions for an impossible choice.
- Code: `assignHalf` checks "separate room?" (around line 318) before the size (around line 329).

**R4. Some refusals come late, after a selection.**
- Rooms that exist once (kitchen, living, dining, drawing, master bedroom, ICU, stair rooms) already placed
  elsewhere cannot take a half that does not touch them.
- A half next to the rest of a multi-cell room cannot be given away: "Living Hall would be cut in two".
- The cards say so only in small text, and they are still selectable.

**R5. After dividing, rooms cannot be placed the normal way.**
- In placement mode (ROOMS → READY → look at a cell) a divided cell is refused with **speech only**: "This cell is
  divided. Use Refine to change it." Code: `placeCell` (`compassReducer.ts` line 192).
- Nothing appears on screen, and if the voice is unavailable nothing happens at all.
- The natural next step, "put the armed room on the left half", is not possible.

**R6. Too many selections.**
- One room in one half takes 8 dwell selections: REFINE, cell, half, READY, page, page, READY, card. That is about
  25 s with the 1.2 s pauses after each screen change.
- READY resets on every page (`onPage` in `CompassMapScreen.tsx`). The list has 18 cards over 3 pages, starting
  with outdoor uses.

**R7. Windows-only differences: not ruled out.** Check with Part 4 whether any of these play a part:
- speech availability;
- Tobii accuracy on the halves at 125 % and 150 % display scaling;
- timing of the post-navigation pause.

### Outside: "Needs more free memory" (confirmed by code and measurement)

**O1. The memory gate is calibrated to the wrong number.**
- The Outside button is enabled only if Windows' **available** physical memory is at least
  `max(600 MB, 7 % of RAM capped at 400–800 MB)` (600 MB on 8 GB, 800 MB on 16 GB). Electron's
  `getSystemMemoryInfo().free` is "available" on Windows.
- It is read **once, when the studio opens**: `electron/floorplanService.ts` `resources()`, and `outsideAllowed` in
  `CompassStudio.tsx`.
- The Outside preview itself costs little (measured on macOS): +12 MB at 1600 × 1000 and +29 MB at 2400 × 1600, and
  the whole service peaks at 86–112 MB.
- A laptop running the gaze stack, the voice and a browser often has less than 600–800 MB available, so the button
  is disabled although the view would fit easily. There is no re-check, no "Try again", and no numbers on screen.

### "The start takes too long"

- **S1. First launch after pulling `1263eed` (one-time).** `start-dev.bat` rebuilt the interface (`vite build`) and
  recompiled the Electron process (`tsc`) because sources changed, and `setup.bat` re-checked the changed Python
  requirements.
- **S2. The first GENERATE in each session.** The floor-plan service starts only then (lazy, as intended), so the
  first plan waits for:
  - Python to start;
  - cairo, shapely and numpy to load (Windows antivirus scans their DLLs on the first load after an update);
  - the first model and drawing.

  On the Mac with warm caches this is 0.12 s to ready plus about 0.2 s per first drawing; Windows is not measured.
  The wait is now up to 25 s instead of failing at 6 s. Nothing is prewarmed.
- **Lazy loading is in place.** The Compass code is a separate 154 KB chunk (46 KB gzipped), fetched in the
  background after the first screen. The floor-plan service never starts at app launch. The fix is to start it a
  little earlier (when the Compass map opens), not at launch.

## 4. Reproduce on the Windows laptop (before changing anything)

Use the Electron app with the Tobii, at the laptop's normal display scaling. For each scenario, record:
- the plot;
- every selection made;
- the exact on-screen text and speech;
- whether the map shows the division;
- the time taken;
- the lines in `<profile>\logs\health\health.jsonl` and `tools\reports\dev-*.log`.

1. Skip every foundation question → REFINE → any cell → LEFT HALF. Expected bug R1: "too narrow for any room".
2. 30 × 50 plot: divide an empty cell, LEFT → Bathroom. Expected R2: "Too narrow: needs 3′-11″".
3. 40 × 60 plot with a bedroom placed: LEFT of another cell → Bedroom. Expected R3: two questions in a row.
4. 40 × 60 plot, living hall over two cells: divide one of them, give the half next to the other cell → Kitchen.
   Expected R4: "Living Hall would be cut in two".
5. After a division: ROOMS → Bathroom → READY → look at the divided cell. Expected R5: speech only, nothing on
   screen.
6. Count the selections and seconds to put a passage in one half (R6).
7. GENERATE → look at Outside. If it says "Needs more free memory", record:
   - Task Manager → Performance → Memory: "Available", and the installed RAM;
   - the `floorplan:resources` reply: add a temporary `console.log` of `resources()` in `floorplanService.ts`
     (O1).
8. Close and restart the app; time the window appearing. Open the Compass map, press GENERATE, time the first
   image. Check the dev log for "Building the interface" (S1, S2).

## 5. Proposed solutions and implementation plan

### Phase A: correctness (small, safe; do first)

| Item | Change | Done when |
|---|---|---|
| A1 | SKIP keeps the current answer (prefill or survey) and says so, for example "Skipped. Kept 40 ft." Use the first option only when nothing is set. File: `CompassMapScreen.tsx` (`f-skip`). | Skipping every question gives 40 × 60 West by default, or the survey's plot. Covered in `check-design-map-actions.cjs`. |
| A2 | `assignHalf` checks whether a **new** room would fit before asking "separate…?". When it cannot fit, ask one question: "Bedroom needs 6′-11″; this half gives 4′-6″ → Use the whole cell for Bedroom 2 / Choose another room". | New cases in `check-compass-refine.cjs`. |
| A3 | Every refusal on the map also shows on screen: one status line on the road (`aria-live`), cleared after about 6 s. For a divided cell, say "Divided cell: choose a half (see B1)". | Visible without speech. Layout audit passes. |
| A4 | When `halvesUsable` is false (20 ft and 25 ft plots), REFINE says so before a cell is picked: subtitle "Halves too narrow on a 20 ft plot", with speech. | Scenario 1 in Part 4 ends at the rail, not after three selections. |

### Phase B: make halves usable (the main fix; two questions for the maintainer first)

| Item | Change | Done when |
|---|---|---|
| B1 | Place on halves directly. In placement mode, looking at a divided cell opens the half chooser (the focus view naming the armed room: "Place Bathroom in: LEFT HALF / RIGHT HALF"). The chosen half gets the armed room by the same `assignHalf` rules, then the map returns. | One room in a half takes 2 selections from the armed map (cell, half). |
| B2 *(maintainer's yes needed)* | A size shortfall in a half becomes a **warning, not a refusal**, as for whole rooms since Phase 1. The room is assigned, the half shows a warning mark on the map and in the focus view ("Kitchen: 4′-6″ clear, needs 4′-11″"), and the kernel's `size-short` note appears in the studio. Keep the hard limit only where a half is under 2′-6″ clear (20 ft and 25 ft plots), where no split is offered. | Scenario 2 assigns the bathroom with a visible warning. |
| B3 *(maintainer's yes needed for READY)* | The room picker is built for halves. Page 1 holds Leave empty, rooms that join a neighbour ("Joins Living Hall"), and rooms that fit. Rooms that cannot be placed here at all (one per floor elsewhere, stair already taken) come last, disabled, with the reason. READY stays on across pages in this picker; the 1.2 s post-navigation pause already prevents accidental selection. | A passage or bathroom is on page 1. Disabled cards cannot be chosen. |
| B4 | "Cut in two": the focus view marks which half connects to the rest of the room, and the question offers "Give the other half instead" first. | Scenario 4 needs one extra selection, not a dead end. |
| B5 | Target: one room in one half takes at most 4 selections through REFINE (cell, half, READY, card) when the card is on page 1, and 2 through B1. | Measured in `check-design-browser-dwell.cjs` (`compass-refine*` screens). |

Keep the whole-cell, Undo, Back and legacy behaviour unchanged. A divided cell stays **one** gaze target on the
map unless the Tobii test shows each half (at least 96 px wide, with a 16 px dead zone) is reliable at the laptop's
scaling; decide that only after measuring.

### Phase C: Outside on normal laptops

| Item | Change | Done when |
|---|---|---|
| C1 | Replace the fixed floor with a cost check. Cost estimate: 4 bytes × width × height × 3, plus 30 MB (about 50–80 MB at preview sizes; confirm on Windows). Allow Outside when available memory ≥ cost + 300 MB reserve. Light machines keep drawing at 1600 × 1000 without supersampling. | Outside is enabled on the 8 GB laptop in normal use. |
| C2 | Re-check when the person chooses Outside, not only when the studio opens. If memory is still short, the caption gives numbers ("Outside needs about 120 MB; 240 MB free now") and the button offers "Try again". | No permanent dead button. |
| C3 | Log `floorplan-resources` (total, available, threshold, decision) to the health log whenever Outside is refused. | Visible in `health.jsonl`. |

### Phase D: faster first plan, still lazy

| Item | Change | Done when |
|---|---|---|
| D1 | Prewarm: when the Compass **map** opens (not at app launch), call `floorplan:ensure-server` in the background. The service still leaves after 10 idle minutes. | The first GENERATE shows an image without waiting for the service to start. |
| D2 | After the service starts listening, import `compass_studio`, `compass_geometry`, `compass_plan2d` and `compass_text` (and read the fonts) in a background thread. It already runs at below-normal priority. | The first request pays no import time. |
| D3 | Record spawn → ready, first model, and first image in the health log. | Numbers available from the laptop. |
| D4 | Note in the user guide that the first launch after an update rebuilds the interface. | Done. |

### Phase E: checks to add or update

- `scripts/check-compass-refine.cjs`: SKIP keeps answers (reducer level, if moved there); the order of A2;
  warnings instead of refusals (B2); the picker ordering (B3).
- `scripts/check-design-map-actions.cjs`: the half chooser from placement mode (B1), and the road status line
  (A3).
- `scripts/check-design-layout.cjs` and `scripts/check-design-browser-dwell.cjs`: new states. Footer IDs keep
  104 px height and 28 px clearance.
- `scripts/check-compass-studio-v2.cjs`: Outside enabled, disabled, and re-checked (C1, C2).
- Python: the background imports (D2) never load the legacy renderer or OR-Tools (`test_compass_phase1.py`
  already checks fresh imports).

## 6. Verify on Windows

- Run the Part 4 scenarios again, by gaze, at 100 %, 125 % and 150 % display scaling. Record the selections and
  seconds per half.
- Watch `GazeConnectFloorplan` (or `python.exe` in dev) in Task Manager: during a studio session, and after 10 idle
  minutes, when it should be gone.
- Time from GENERATE to the first image, cold and warm.
- Run `npm run check:compass`, `npm run check:compass-browser` (needs Playwright, Vite and the floor-plan service),
  and `python -m unittest discover -s python/tests`.
- Synthetic gaze in a browser needs the page visible: a hidden pane stops `requestAnimationFrame`, and the
  GazeCursor's dwell loop with it.

## 7. Rules that must hold

- `CLAUDE.md`:
  - dwell timings unchanged (use the existing dwell groups);
  - targets at least 80 px (footers 104 px with 28 px bottom clearance);
  - fits 768 and 1080 heights at 1366 and 1920 widths, with no scrolling;
  - dark theme;
  - emergency controls always reachable;
  - the 1920 × 1080 layout is not broken.
- One canonical plan (`CompassPlanV2`); every change is one undo step; a room is never removed silently.
- A preliminary concept only: DXF is not DWG, and no claim of building-code compliance.
- No pull request. Push only to `ui/aac-visual-exploration`, only when asked.
