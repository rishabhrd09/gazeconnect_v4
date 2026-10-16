# Compass Refine: implementation log

This log records what was built against `IMPLEMENTATION_PLAN.md`, phase by phase, what was verified and how, and
where the implementation departs from the plan. Status labels: **done** (built and checked here), **partial**, and
**not verified here** (needs the Windows machines or the Tobii rig).

Started 14 Oct 2026 on branch `ui/aac-visual-exploration` at `fae945b`. Nothing is committed; the work is left in
the working tree for review.

## Phase 0: baseline

- `python/tests/fixtures/compass/f01_asymmetric_30x50.json`: the Appendix A house, both as the v1 map the app sent
  and as a `CompassPlanV2` intent. Migration of `v1` must reproduce `plan` exactly.
- `python/tests/fixtures/compass/f02_facings.json`: the one orientation table (north vector, map edge labels,
  rose rotation) that every view and export is tested against.
- `scripts/probe-compass-current.py`: re-runnable probe of the current pipeline. Deterministic `result` (options,
  notes, doors, windows, stair, wall footprint against the plot, DXF header) and a machine-only `measure` section
  (timings, memory: private bytes on Windows, resident set elsewhere). `--golden` stores the result, `--compare`
  reports differences.
- `python/tests/fixtures/compass/golden/f01_pipeline_fae945b.json`: the result for F1 before any change. It
  reproduces Appendix A: one invalid option, **0 doors on both floors**, walls **0.375 ft outside the plot** on
  every side, DXF R2010 in millimetres with 0 audit errors and the front at y = 0.
- `scripts/benchmark-compass-views.py` now also records current private bytes on Windows (peak working set as
  before).

Measured here (macOS, M5 Pro): F1 options 0.03 s, 2D PNG 0.13 s per floor, exterior 0.44–0.49 s per angle,
process peak 113 MB. Not Windows evidence.

## Phase 1: correctness and resource quick wins

| Item | Where | Status |
|---|---|---|
| North/South map labels fixed (North-facing: left East, right West; South-facing: left West, right East); rose rotation now read from the same module | `src/utils/compassDirections.ts`, `CompassMapScreen.tsx` | done |
| Tall plots no longer rotated: road at the bottom, deep plots give a tall sheet at true proportions; studio corner zoom uses the unrotated corners | `tools/compass_drawing.py` (`sheet_size`, `draw_2d`), `CompassPlanStudio.tsx` | done |
| Room size judged on the largest rectangle of the whole room, not per cell | `candidates._room_fits` | done |
| Size shortfalls are notes and never remove doors; doors are planned on every floor whose geometry is sound (stale doors are removed elsewhere) | `candidates._validate` (`shortfalls`, `geometry_valid`), `compass_presentation.model/options` | done |
| No 12-riser stairs: only the dog-leg core or a 16-riser straight flight; otherwise a conflict note | `compass_furniture.stair/draw_stair` | done |
| Feet-and-inch cell sizes everywhere (7'-6" × 12'-6", never "8x13 ft"); exact `cell_size_ft` | `src/utils/feetInches.ts`, `ArchitecturalCell.tsx`, `CompassMapScreen.tsx`, `floorplanApi.ts` | done |
| Readiness: main waits for `/api/health` from its own child (150 ms steps, ≤ 25 s for a cold start on a slow laptop; a process that ends stops the wait) instead of a fixed 250 ms; a foreign process on the port is refused | `electron/floorplanService.ts`, `floorplanApi.ts` | done |
| Lifetime: `--parent-pid` watch (ends within 5 s of the app), `--idle-seconds 600` with exit code 75 that is not respawned | `tools/floorplan_runtime.py`, `floorplanService.ts` | done on macOS; Windows handle wait **not verified here** |
| Watchdog: a drawing over 35 s, or no health answer for 5 s during one, replaces the process | `floorplanService.ts` | built; not exercised against a real stuck job |
| Lazy legacy imports; `/v5/generate` and `/fusion-report` deleted; OR-Tools and pandas never loaded (checked in a fresh process) | `tools/floorplan_server.py` | done |
| OR-Tools removed from the bundle and self-test; `svgwrite` removed; `fonttools` declared | `Build-Installer.ps1`, `floorplan_entry.py`, `requirements.txt`, `constraints.txt`, `check_python.py` | done; bundle size and idle memory on Windows **not measured** |
| Job manager: one running job, one pending slot per channel (preview, export), newest wins, cooperative `checkpoint()`, superseded work never cached; requests without a job id keep the 429 contract | `tools/compass_resources.py` | done |
| `/api/health` reports pid, parent pid, own memory, job state and cache; the health log gains a `floorplan` section while the service runs | `floorplan_server.py`, `healthRecorder.ts` | done |
| Gaze-safe saving: `floorplan:save` writes the service's file to `Documents\GazeConnect Plans\<date>\` under an app-chosen name; no Save dialog | `floorplanService.ts`, `preload.ts`, `CompassPlanStudio.tsx` | done |
| Memory check for the heavier views (`floorplan:resources`, floor = max(600 MB, low limit)) | `floorplanService.ts` | built; used by the studio from Phase 5 |

Deviation: the Windows job object (`KILL_ON_JOB_CLOSE`) was not added. Node cannot create one without a native
module; the parent watch covers the same case (app killed or crashed).

F1 after Phase 1 (`scripts/probe-compass-current.py --compare`): 9 ground-floor and 5 first-floor doors (were 0);
three honest size notes (living hall, master bedroom and 1F family room are 7'-6" wide) instead of five. The
first floor now reports that its 7'-6" × 12'-6" landing cannot hold the 16-riser stair, where a 12-riser stair
used to be drawn. Walls are still drawn centred on the plot line; Phase 4 moves them inside.

Tests: `python/tests/test_compass_phase1.py` (orientation, per-room size, doors on shortfalls, stairs, job
manager, runtime, health, parent and idle exit); the existing Compass tests pass, with the rotation assertion
changed to "deep plot → tall sheet at true proportions".

## Phase 2: one plan, one model

| Item | Where | Status |
|---|---|---|
| `CompassPlanV2` (§4.3): plot facts, divided cells (`splits`, exactly 50 % left \| right), rooms as identities owning regions (`r2_c3`, `r2_c3.L`), two choices; Passage (both floors) and Open to below (first floor) added | `tools/compass_schema.py`, mirrored in `src/types/compassPlan.ts` and `src/utils/compassPlan.ts` | done |
| Validation in both languages against the same fixtures F1–F12 and F15 (C2 and the half-void case); v1 → v2 migration (§4.8) with one-time notices, `legacy` kept verbatim; v1 derived only for undivided plans | `scripts/make-compass-fixtures.py`, `scripts/check-compass-plan.cjs` (68 checks), `python/tests/test_compass_geometry.py` | done |
| PlanModel kernel: regions → rooms → noded edges → boundary table (§7.2) → walls (9″ outer walls inside the plot line, 6″ centred partitions) → clear polygons → stair core → doors → windows → void → upper floor and supports → fixtures → labels → notes → checks → `modelHash` | `tools/compass_geometry.py` | done |
| Open plan: no wall among living, dining, kitchen, stair hall and an open drawing room (kitchen open unless the survey says "Closed Kitchen"); the double-height hall (rail to public rooms, partition to private rooms, tall glazing on outer edges) | same | done |
| Access planner: deterministic shortest routes with privacy rules (never through a bedroom or bathroom); a passage is preferred for bedrooms; door positions avoid swing clashes; a wall that cannot take a door is blocked and the route replanned; unreachable rooms are named with the cell to make a passage | same | done |
| Same plan, same model, in any process (`modelHash` checked across processes); orientation table F2 | `test_compass_geometry.py` | done |

Deviations: no adapter layer between the old and new drawing modules. The old modules stay, unchanged, for the
fallback studio (`GAZECONNECT_COMPASS_V2=0`). New room ids are numbered after the highest existing one of their use
(`g-bedroom-3` after `g-bedroom-2`), never reusing a removed number.

## Phase 3: Refine on the map (divided cells)

The split of one cell into two halves is in the plan (§5) and is implemented in full on the map.

| Item | Where | Status |
|---|---|---|
| State keyed by room identity; every change computed by a pure function and committed as one undo step (`COMMIT_FLOOR`, the existing 120-step history); placement, Refine and whole cell share it | `src/utils/compassReducer.ts` | done |
| REFINE, the fifth rail action ("Divide a cell"); while on it reads DONE REFINING, Floor/Rooms/Next/Generate are disabled, READY is hidden and the road says what to do; with the version 2 map off it is not offered | `src/screens/CompassMapScreen.tsx` | done |
| Focus view: LEFT HALF and RIGHT HALF as two equal targets (615 × 420 px at 1366 × 768, 876 × 637 px at 1920 × 1080, 72 px gap), owner and real size per half, "Below: …" upstairs, a thumbnail with ROAD, UNDO / WHOLE CELL / gaze / BACK TO MAP at 104–130 px with 28–38 px bottom clearance | `src/components/compass/CompassRefineFocus.tsx` | done (measured in the browser) |
| The room picker in assign mode: Leave empty first, READY gating and paging unchanged, a fit line per card using the same rules as the commit ("Joins Living Hall", "Too narrow: needs 3′-11″", "One per floor: placed elsewhere", "Makes the living hall below double height") | `src/components/compass/CompassRoomPicker.tsx` | done |
| §5.3 cases: occupied cell (A \| A), empty cell, multi-cell room cut in two (refused with "Give the other half instead" / "Give both halves"), duplicate use (extend when touching, else "Make a separate Bedroom 2"), single uses refused, too-narrow half ("Use the whole cell for …", naming any room it replaces), partial assignment, WHOLE CELL (both empty or same room: at once; otherwise a question naming what each answer removes), placement on a divided cell refused, narrow plots (20/25 ft: the split is not created), Open to below only over the living hall, dining or stair hall | reducer and screen | done (`scripts/check-compass-refine.cjs`, 61 checks; browser walk-through) |
| Drafts: version 2 keys, v1 drafts migrated once and left untouched, newer drafts read-only, LOAD PREVIOUS SESSION; backend copy | `src/utils/compassDraft.ts`, screen | done |
| Legacy maps: cells with saved Refine Map details stay locked as before; REFINE offers "Convert to the new map", listing what is kept and drawn and what is kept read-only; nothing is deleted | screen | done |
| Divided cells on the map: two halves inside the cell's one gaze target, owner colours, a divider line (dashed when both halves are the same room) | `SplitCellFace` in `src/components/ArchitecturalCell.tsx`, `compass-workspace.css` | done |

Deviations from the plan, each deliberate:
- Dividing a cell and choosing the first half's room are **one** undo step (the plan listed split and assign
  separately). The split alone changes nothing (both halves keep the cell's room), and leaving before choosing a
  half must change nothing, so the split is committed with the first choice.
- The 45-second quiet period ends Refine **on the map** only. The focus view and the picker are deliberate
  overlays with their own Back (like the room menu, which never timed out).
- A conflict question replaces the picker's cards with large answers (412 × 123 px at 1366 × 768) instead of
  sharing a row with disabled cards.
- "Stair host cell": the focus view says when a change makes the stair room smaller, that the plan notes say whether
  the stair still fits, and that UNDO puts it back. Whether it fits is decided once, by the kernel (a `stair-no-fit`
  conflict in the studio's notes); it is not duplicated in TypeScript.
- "Open to below would cut the route": reported by the kernel as an unreachable room with the cell to make a
  passage (and, for a divided cell, the void / passage halves), in the studio's notes, not as a card on the map.
- The backend copy carries the plan inside `compass_map` (`compass_map.compass_plan`), beside the derived v1
  fields, rather than as a separate top-level key: the backend's survey store keeps only `compass_map`, so the two
  are always saved together and the backend needed no change. For divided plans `compass_map` is
  `{requires_v2: true, plot, compass_plan}`.
- Passage narrower than 3′-11″: a warning note from the kernel ("narrower than the 3′-11″ planned for a
  wheelchair route"); 3′-3″ remains the minimum (a conflict below it).

## Phases 4–6: the three views, the sheets and the CAD files

| Item | Where | Status |
|---|---|---|
| Text drawn from glyph outlines of Atkinson Hyperlegible Next (OFL; TTF instances built from the bundled WOFF2), with kerning, so every machine draws the same letters | `scripts/build-plan-fonts.py`, `tools/assets/fonts/`, `tools/compass_text.py` | done |
| 2D plan for the screen (road at the bottom, plot paper, compound wall, chains, north arrow from the facing, scale bar) and A3 sheets (landscape for wide plots, portrait for deep ones; one page per floor; boxed title block) | `tools/compass_plan2d.py` | done |
| Top projection per floor: plan-oblique, cut at 4′-0″, soft shadows, furniture; upstairs the ground is drawn flat and muted, with depth only in the void and the stair well | `tools/compass_top.py` | done |
| Exterior with four named angles (front left, front right, back left, back right): per-plane shading, faces ordered from the eye, the double-height glazing, trees on lawns | `tools/compass_perspective.py` | done |
| DXF R2010 per floor in inches and in millimetres (`$INSUNITS` 1 / 4), layers per §9.3, byte-identical for the same plan, with a README that names both files and makes no DWG or compliance claim | `tools/compass_dxf.py` | done |
| Studio service: `/api/floorplan/compass/v2/model` and `/v2/render`, a small model cache, deadlines per view, newest-wins jobs (409 for a replaced request), `X-Plan-Hash` on every image and file | `tools/compass_studio.py`, `tools/floorplan_server.py` | done |
| Studio screen: Back to map, the floor switch, Plan / Top view / Outside (the fourth button cycles the four angles), Download plan (PNG of this view, PDF sheets, two DXF files and the README, saved to `Documents\GazeConnect Plans\<date>\` without a dialog), Plan notes (paged, conflicts first) | `src/components/compass/CompassStudio.tsx`, `src/utils/floorplanApi.ts` | done |

Deviations: chains are drawn along the top and the left of the plan. Door and window symbols in the DXF are plain
entities on their layers, not blocks. PDF text is glyph outlines (pycairo cannot embed these fonts as text), so
text in the PDF is not selectable; about 350 KB per page. The exterior assumes an accessible roof with a stair
head room (mumty) when a stair reaches the roof. The studio no longer offers alternative layouts, room views,
rotation, corner zoom or exterior finishes (decided 14 Oct 2026); they remain in the fallback studio.

Measured here (macOS, M5 Pro, not Windows evidence), 40 × 60 ft two-storey house, model cached, 1600 × 1000 px:
plan 0.03–0.04 s, top view 0.10–0.12 s, outside 0.08–0.09 s; building the model 0.05 s; PDF of two sheets about
0.35 s; DXF 0.02–0.14 s per file. Sizes: plan PNG 94–127 KB, top view 130–200 KB, outside about 216 KB, PDF about
350 KB per page, DXF 75–81 KB per floor.

## Phase 7: packaging, checks and documents

- Installer: the plan fonts are bundled as `compass_fonts` (where `compass_text` looks in the frozen service) and
  `compass_studio` is a hidden import; the frozen self-test now builds a plan with a divided cell and draws the plan,
  top view, outside, the PDF and both DXF files (`floorplan_entry.compass_v2_self_test`, passes here from source).
- Checks: `npm run check:compass` (plan, Refine rules, saved legacy details, transport: no browser) and
  `npm run check:compass-browser` (map actions with Refine; the new studio). New: `scripts/check-compass-studio-v2.cjs`
  with the fixture `scripts/compass-qa-plan.cjs`; Refine states in `check-design-layout.cjs` (footer height and
  clearance include the focus view and the picker for a half) and `check-design-browser-dwell.cjs`
  (`compass-refine`, `-focus`, `-assign`). `check-compass-studio.cjs` and `check-compass-room-dwell.cjs` now check the
  original studio with the version 2 map off.
- Python: `python/tests/test_compass_views.py` (image sizes in every theme, same plan same bytes, A3 portrait and
  one page per floor, DXF units, layers, audit, extents at the exact scale, north for every facing, the README's
  claims, the service routes and their refusals, v1 maps migrated by the service). Full suite: 255 tests; the only
  error is the existing `test_ml_training_data` import of `torch`, which is not installed here.
- Documents: `AGENTS.md` (the 14 Oct entry supersedes the Refine Map retirement note) and
  `docs/floorplan-end-user-guide.md`.

Not run here: the Playwright checks (no Playwright on this Mac; nothing was installed). Their steps were walked in
the browser preview instead (the map-actions sequence: 37 assertions passed; Refine, the studio and the flag-off
fallback at 1366 × 768 and 1920 × 1080). Windows benchmarks B1/B2, Tobii dwell on the focus view, and the installer
build are for the Windows machines. Phase 6b was not implemented, as decided.

## Windows review before commit (14 Oct 2026)

A review of every path that behaves differently on a Windows laptop, before the work was committed. Fixed:

- **Idle exit never happened.** Electron asks `/api/health` every 5 s while the service runs, and every request
  reset the idle clock, so after the first plan the service stayed resident for the whole session. Health checks
  no longer count as use (`floorplan_server._touch`); `test_compass_phase1` now pings health every half second and
  still sees the idle exit (code 75).
- **Drawing yields to gaze.** The service lowers its own priority at start (`floorplan_runtime.lower_priority`):
  `BELOW_NORMAL_PRIORITY_CLASS` on Windows, nice +5 elsewhere (checked here). It is set from inside the process,
  so the dev venv's launcher cannot race it; failure is never fatal.
- **Saving on Windows.** Documents refused (Controlled Folder Access protects it from unrecognised apps) → the
  file goes to `Downloads\GazeConnect Plans\<date>\` and the studio says so; a file of the same name that is open
  in a viewer (locked) is kept and the new one is saved as "… (2)"; the temporary `.part` file is always removed;
  Windows device names (CON, NUL, COM1 …) are refused. `scripts/check-floorplan-save.cjs` (23 checks).
- **Cold start.** The first plan starts the service; on a slow laptop (antivirus scanning the bundle, cairo,
  shapely and numpy loading) that can take several seconds, so readiness now waits up to 25 s instead of 6 s. A
  process that has ended stops the wait at once.
- **Memory on 4 GB machines.** Measured here (macOS; Windows private bytes may differ): the service is 51 MB after
  start and 56 MB with a plan; a full session at the largest preview size (every view of both floors, all four
  outside angles, the PDF and DXF) peaks at 132 MB; light mode (1600 × 1000) at 108 MB. The 3000 × 2000 outside
  download with its 1.5× working image peaks at 242 MB, so light machines now save the outside at 2400 × 1600
  without supersampling (111 MB). Everything is released when the service leaves after 10 idle minutes.

- **Tests on Windows.** The lifetime test expected the server's pid to be the spawned process's; on Windows a venv's
  `python.exe` is a launcher whose child is the server, so it now accepts either (as Electron does).
- **Font names.** The Bold plan font's internal names said "Regular" (the variable font's defaults); the build
  script now names each instance after its weight. Glyph outlines are unchanged, and drawings load fonts by file.

Checked and unchanged: the service is spawned with `windowsHide` and ended with `taskkill /T /F` (the venv
launcher's child too); it binds 127.0.0.1 only (no firewall prompt); the Windows parent watch is the backend's
proven handle wait; crash restarts are bounded (5, with backoff); OR-Tools and svgwrite are not imported anywhere
the app runs (both absent from this venv, where all tests passed); `fonttools` is pinned in `constraints.txt`
(already an ezdxf dependency); the installer build runs the frozen self-test twice, now including the v2 views,
exports and the bundled fonts. After pulling, run `setup.bat` once (requirements changed).

## Refine fixes, Outside and first-plan speed (16 Oct 2026, `REFINE_FIX_HANDOFF.md`)

Done on the maintainer's 8 GB Windows laptop (7.9 GB RAM, 8 logical CPUs, one 1920 x 1080 display at 100 %
scaling, Tobii Eye Tracker 5 services running), after `setup.bat` and on `1263eed`. The maintainer's decisions for
Phase B: rooms too narrow for a half are placed with a warning (refused only under 2'-6" clear, the 20 and 25 ft
plots, which offer no halves); READY stays on while paging the room list for a half.

### How it was reproduced (Part 4)

The real app, not a browser: `dist-electron/main.js` launched by Playwright through a test wrapper (a throwaway
profile and health log, an off-screen window, the real floor-plan service on its own port), the interface from Vite,
and gaze from a stand-in backend that streams window-fraction gaze frames at 60 Hz with fresh Tobii-like noise per
frame, through the real GazeCursor and dwell. Every scenario step was a dwell, at the maintainer's own speed
(Restful: map and cards 2.15 s, confirmations 2.4 s); setup that is not the scenario (a bedroom already placed) was a
saved map. Speech is what the app sent to the backend. The maintainer's own GazeConnect was not running; nothing of
theirs was touched. The physical Tobii and display scaling could not be exercised by the agent (below).

| # | Scenario (before, `1263eed`) | On screen / spoken (exact) | Selections, time | Cause |
|---|---|---|---|---|
| 1 | No survey, SKIP all seven questions → REFINE → r2_c2 → LEFT HALF | Spoken "Skipped. Default: North." … "Default: 20 ft." … "Default: 30 ft."; road "FRONT / ROAD (North) – 20 ft"; focus "On a 20 ft plot a half cell is only 2'-0" wide inside: too narrow for any room. The cell stays whole." | 10, 42.4 s, to a dead end | R1 confirmed |
| 2 | 30 x 50 plot, empty cell, LEFT → Bathroom (page 2) | Card "Too narrow: needs 3'-11"" (still selectable); question "Bathroom needs at least 3'-11" clear; this half gives about 3'-3"." → Use the whole cell / Choose another room | 6, 24.7 s, no bathroom in the half | R2 confirmed |
| 3 | 40 x 60, Bedroom in r3_c1; LEFT of r3_c3 → Bedroom | "Bedroom is elsewhere on this floor. Make a separate Bedroom 2, or choose another room." then, after "Make a separate Bedroom 2", "Bedroom needs at least 6'-11" clear; this half gives about 4'-6"." | 7, 28.8 s, two questions for an impossible choice | R3 confirmed |
| 4 | 40 x 60, Living Hall r2_c2 + r2_c3; LEFT of r2_c3 → Kitchen | Card said only "Too narrow: needs 4'-11""; question "Living Hall would be cut in two. Give the right half instead, or give both halves." (the right half then met the size refusal) | 5, 21.3 s | R4 confirmed |
| 5 | Divided r2_c3; ROOMS → Bathroom → READY → look at r2_c3 | Nothing changed on screen (road, cell, any status); spoken only "This cell is divided. Use Refine to change it." | 6, 25.6 s | R5 confirmed |
| 6 | A passage in one half, shortest route | REFINE, cell, LEFT, MORE, MORE, READY, Passage | 7, 25.5 s (3.8 s each: 2.15 s dwell + 1.2 s pause after each screen change) | R6 confirmed |
| 7 | GENERATE → Ground floor only → Outside | Button "Outside · Needs more free memory", disabled; main's reply `{availableMb: 248, floorMb: 600, exterior: false, light: true}` (Task Manager: 235 MB available); nothing in the health log | first image 5.2 s after the choice (cold service) | O1 confirmed |

Also confirmed or found on the laptop:

- **R7 (Windows differences).** Speech is available: the Kokoro voice files verify, and the maintainer's own session
  at 03:06-03:10 spoke (phonemizer lines in `tools/reports/main-console-20261016-030614.log`). Display scaling here
  is 100 % (1920 x 1080, 96 DPI). The post-navigation pause is the same code on every platform (1.2 s, measured in
  the 3.8 s per selection above). Tobii accuracy on the halves at 125 % and 150 % could not be checked: it needs a
  person at the tracker, and changing Windows display scaling is not something the agent may do.
- **O1, in numbers from the maintainer's session** (`health.jsonl`, 21:34-22:05 UTC, GazeConnect running): Windows'
  available memory had a median of 335 MB (minimum 15 MB, maximum 991 MB) and was at least 600 MB in 3 % of
  samples, so Outside was disabled nearly always; commit headroom never fell below 2.2 GB. At 150 MB, 200 MB, 300 MB
  and 350 MB the shares were 88 %, 83 %, 62 % and 45 %: "cost + 300 MB" (C1 as proposed) would have allowed Outside
  only about 35-45 % of the time, so the reserve was calibrated to 150 MB (below).
- **New cause N1: numpy's OpenBLAS commits a buffer per CPU thread.** Measured by starting the service as Electron
  does (`floorplan_server.py --parent-pid --idle-seconds 600`): private bytes rose from 26 MB to 260 MB on the first
  model while the working set rose only from 36 MB to 51 MB; with `OPENBLAS_NUM_THREADS=1` the same run peaked at
  78 MB private (48 MB after a drawing) with identical timings. The 288 MB "floorplan mb" in the health log was this
  commit, not memory in use; the Outside view itself added 10-30 MB.
- **New cause N2: the health log's `floorplan.mb` is private bytes only**, which on Windows overstated the service
  four- to six-fold; it now also records the working set (`wsMb`).
- **S1 (start).** On this laptop `vite build` alone takes 2.3 s and `tsc -p tsconfig.electron.json` 2.4 s (warm, into
  a scratch folder). Measured as the maintainer starts the app (`start-dev.bat --quiet`, hardware mode, then
  `stop-dev.bat`): 19.8 s from the command to the interface's first paint when the interface had to be rebuilt
  (Electron started at 18.1 s), and 6.6 s with nothing to rebuild (Electron at 5.5 s; the 23 Sep measurement was
  6.4 s). So a first launch after an update costs about 13 s more, once. What felt slow on 16 Oct was mostly
  `setup.bat` (51 s here, 26 s of it the helper build) and, before it, a launch that stopped with "Setup is needed"
  because the first setup had not finished.
- **S2 (first plan), from the maintainer's session:** GENERATE at 03:09:09.6, service listening +1.2 s, health +1.4 s,
  model +2.1 s, first image +2.75 s. Measured directly: ready 1.3 s, first model 0.57-0.62 s (imports), first plan
  image 0.38-0.45 s, warm model 0.0 s, warm plan 0.03 s.
- **Two 12 s `ui-stall` events at 21:38:52 and 21:39:04 UTC are not a fault of the app:** interface CPU was 0 % and
  the main process normal, and the tracker reported no user present from 03:07:44 to 03:09:00 (the window was
  covered while the maintainer was away); the service started only at 03:09:09.

### What changed

| Item | Change | Where | Check |
|---|---|---|---|
| A1 | SKIP keeps the answer already given (prefill or survey) and says "Skipped. Kept 40 ft."; the kept answer is marked on its option and in the status line ("SKIP keeps West."); the first option only when nothing is set | `compassReducer.ts` `skippedAnswer`; `CompassMapScreen.tsx` foundation | `check-compass-refine.cjs` (every question skipped keeps 40 x 60 West); `check-design-map-actions.cjs` (fresh map, skip all, draft holds West 40 x 60) |
| A2 | A new room's size is judged before "a separate Bedroom 2?", so a choice is one question; "Use the whole cell for …" names the room it would make | `assignHalf`; screen | `check-compass-refine.cjs` |
| A3 | Every refusal on the map also shows on the road: one status line (`#compass-road-status`, `role="status"`, polite), cleared after 6 s or by the next placement; also the 45-second ends | screen `tell`, road | `check-design-map-actions.cjs`; layout state `compass-road-notice` |
| A4 | On 20 and 25 ft plots REFINE reads "HALVES TOO NARROW ON A 20 FT PLOT" and, chosen, says why and stays on the map | screen `narrowPlotReason` | `check-design-map-actions.cjs` (20 ft plot) |
| C1 | The fixed 600 MB floor is replaced by a cost check for the size the studio asks for: cost = 4 B x width x height x 3 + 30 MB; allowed when available >= cost + 150 MB and commit free >= cost + 256 MB; otherwise the light size (1600 x 1000, no supersampling) is tried before refusing; 4 GB machines stay light | `electron/floorplanService.ts` `decideResources` | new `scripts/check-floorplan-resources.cjs` (18 checks), in `npm run check:compass` |
| C2 | Memory is read again each time Outside is chosen; the button is never disabled; a refusal keeps the plan on screen, the caption says "Outside needs about 199 MB of free memory; 150 MB is free now. Close another program, then try again.", the button reads "Short of memory · Try again" | `CompassStudio.tsx`, `floorplanApi.ts`, `preload.ts`, `main.ts` | `check-compass-studio-v2.cjs` (refused, then drawn) |
| C3 | A refused Outside writes `floorplan-resources` (total, available, commit free, cost, need, size) to the health log | `floorplanService.resources` | `check-floorplan-resources.cjs` |
| D1 | The service starts in the background when the Compass map opens (never at launch); it still leaves after 10 idle minutes | `prewarmFloorplanService` (`floorplanApi.ts`), map screen | real app run (below) |
| D2 | Once started, the service imports `compass_studio`, `compass_geometry`, `compass_plan2d`, `compass_text` and reads both plan fonts in a background thread (0.2-1.3 s here, 4.2 s with the laptop loaded by two test runs); `/api/health` reports `warmS` | `tools/floorplan_server.py` `warm_studio` | `test_compass_phase1.py` (only the studio's modules, never the legacy renderer or OR-Tools; fonts read) |
| D3 | `floorplan-first-ready`, `floorplan-first-model` and `floorplan-first-image` events, each with `ms` and `sinceSpawnMs` (one name each: the health log keeps one event of a name within 2 s, which swallowed the image in a first version) | `floorplanService` | `check-floorplan-resources.cjs`; real app run (below) |
| D4 | User guide: the first start after an update, Outside when memory is short, and every change above | `docs/floorplan-end-user-guide.md` | - |
| N1 | One OpenBLAS thread for the service (set before numpy loads, and by Electron when it spawns it) | `floorplan_server.py`, `floorplanService.ts` | `test_compass_phase1.py`; measured above |
| N2 | `wsMb` (working set) and `warmS` in the health log's `floorplan` section | `floorplanService.healthSnapshot` | - |
| B1 | In placement, a divided cell opens the half chooser naming the armed room ("Place Bathroom in:"); the half gets the room by `assignHalf`, questions appear in the focus view, and the map returns; a half that holds another room is replaced only after "Yes, replace …" | screen `openPlaceHalf`, `onHalf` | `check-design-map-actions.cjs`; layout `compass-place-half`, `compass-place-question`; dwell `compass-place-half` |
| B2 | A room narrower than its use needs is placed with a warning; only a half under 2'-6" clear is refused (20 and 25 ft plots offer no halves; an older draft divided there refuses a side-wall half). The warning: "⚠ NARROW" on the map (and ", narrow" in the cell's label), "Kitchen: 4'-6" clear, needs 4'-11"" in the focus view, "Narrow: …" in the message and on the road, and the kernel's `size-short` note in the studio | `assignHalf`, `halfShortfall`, `roomClearWidthIn`, `SplitCellFace`, `CompassRefineFocus` | `check-compass-refine.cjs`; `check-design-map-actions.cjs`; the service's `size-short` note checked against a kitchen half |
| B3 | The picker for a half: Leave empty, rooms that join a neighbour (or are this room), rooms that fit (indoor first), narrow rooms (smallest shortfall first, "⚠ Narrow: …"), and last, disabled and dashed, rooms that cannot go there with the reason; READY stays on across pages | screen `renderAssign`, `CompassRoomPicker.tsx`, CSS | `check-design-map-actions.cjs` (passage and bathroom on page 1, READY across pages, porch disabled last) |
| B4 | The focus view marks a half that joins the rest of a room ("Joins the rest of Living Hall"); the picker says "Cuts Living Hall in two" on that half; the question offers only answers that work, the other half first | `halfLinksRoom`; screen | `check-compass-refine.cjs` (including a middle cell, where neither half can go) |
| - | Choosing another room for a half whose old room had no other part now says "Bathroom removed." (never silent) | screen `applyAssign` | `check-design-map-actions.cjs` |
| N3 | New cause, found by the full studio check on the laptop: the studio released its last preview image on closing through `setImage(...)` in its unmount cleanup; React runs such an updater at once only when nothing else is pending, otherwise the update is dropped with the closing studio and the image stays in memory ("Closing releases the image" failed once in five runs; the post-matrix steps alone passed 4 of 4). Every image URL is now kept in a ref and released directly on closing | `CompassStudio.tsx` (`liveImages`) | `check-compass-studio-v2.cjs` (full matrix) |

### Verified on the laptop after the fixes

The same real-app harness, every step by dwell at the Restful speed (the laptop was also running the Python suite
and the layout audit, so seconds are an upper bound):

| # | Scenario (after) | On screen / spoken (exact) | Selections, time |
|---|---|---|---|
| 1 | No survey, SKIP all seven → REFINE → r2_c2 → LEFT HALF | "Skipped. Kept West." … "Kept 40 ft." … "Kept 60 ft." … "Default: Left."; road "FRONT / ROAD (West) – 40 ft"; the draft holds West 40 x 60; the room picker for the half opens | 10, 41.4 s, picker open (was a dead end) |
| 1b | 20 x 50 plot, REFINE | Rail "REFINE · HALVES TOO NARROW ON A 20 FT PLOT"; chosen, the road and speech say "On a 20 ft plot a half cell would be only 1'-6" to 2'-0" clear, under the 2'-6" a half needs. Cells stay whole on this plot."; Refine does not open | 1, 5.7 s (A4: at the rail) |
| 2 | 30 x 50, LEFT → Bathroom (page 2) | Card "⚠ Narrow: 3'-3" clear, needs 3'-11""; placed: "Left half: Bathroom. Narrow: 3'-3" clear; Bathroom needs 3'-11"."; the half shows "⚠ Bathroom: 3'-3" clear, needs 3'-11""; spoken in words | 6, 23.0 s, placed with a warning |
| 3 | 40 x 60, Bedroom placed; LEFT of r3_c3 → Bedroom | One question: "Bedroom is elsewhere on this floor. Make a separate Bedroom 2, or choose another room. Narrow: 4'-6" clear; Bedroom needs 6'-11"." → "Make a separate Bedroom 2" → "Left half: Bedroom 2. Narrow: …" | 7, 29.1 s, one question (was two and no room) |
| 4 | 40 x 60, Living Hall over two cells; LEFT of r2_c3 → Kitchen | Before choosing: the left half says "Joins the rest of Living Hall", the Kitchen card "⚠ Cuts Living Hall in two"; question "Living Hall would be cut in two. Give the right half instead, or give both halves." → "Give the right half instead" → "Right half: Kitchen + Store. Narrow: 4'-6" clear; Kitchen + Store needs 4'-11"." | 7, 29.2 s: one extra selection, no dead end |
| 5 | Divided r2_c3; ROOMS → Bathroom → READY → r2_c3 | "Place Bathroom in: The left half or the right half"; RIGHT HALF → the map returns with PASSAGE \| BATH; spoken "Right half: Bathroom, 5 feet by 15 feet." | 2 selections, 8.1 s from the armed map (B1 target: 2) |
| 6 | A passage in one half, shortest route | REFINE, cell, LEFT, READY, Passage (page 1) | 5, 17.9 s: 4 after REFINE (B5 target: 4); was 7, 25.5 s |
| 7 | GENERATE → Ground floor only → Outside | Button "Outside · The house from the street", enabled; drawn in 3.4 s; main's reading `{availableMb: 251, commitFreeMb: 4030, costMb: 44, needMb: 194, 1500 x 800, exterior: true}`; Task Manager 249 MB available | Outside drawn on the same laptop and memory that refused it |

The first plan and Outside on a quieter laptop (the same harness, the map open 11 s before GENERATE): the service,
started when the map opened, was ready 2.8 s after its spawn; after "Ground floor only" the first plan image was on
screen in 0.7 s (`floorplan-first-model` 394 ms, `floorplan-first-image` 266 ms), against 2.75 s in the maintainer's
own session, which started the service at GENERATE. In the same run Windows had only 48-156 MB available (Task
Manager 48 MB), and Outside was refused as designed: the plan stayed on screen, the caption read "Outside needs
about 191 MB of free memory; 130 MB is free now. Close another program, then try again.", the button "Short of
memory · Try again", and the health log `{"ev":"floorplan-resources","decision":"refused","totalMb":7919,
"availableMb":130,"commitFreeMb":3682,"costMb":41,"needMb":191,"width":1450,"height":650}`. Earlier, at about 250 MB
available, the same laptop drew it (row 7).

The service in the real app (Part 6): opening the Compass map started it in the background
(`floorplan-first-ready` 1.9 s after the spawn on a quiet laptop, 4.8 s with two test runs beside it); with the map
left alone it wrote `floorplan-idle-exit` exactly 10 minutes after it started, both of its processes (the venv
launcher and the interpreter) were gone, and it was not started again. Its memory in the health log after the
fixes: 45.6 MB private, 23.1 MB working set, peak 55.3 MB (was 271-298 MB private).

Deviations from the handoff, each deliberate:

- **C1's reserve is 150 MB, not 300 MB**, because 300 MB fails the handoff's own "done when" on this laptop (see O1
  above); the cost estimate is the handoff's, conservative against the 10-30 MB measured. Commit headroom (256 MB) is
  checked as well, so no allocation can fail. One constant (`OUTSIDE_RESERVE_MB`) if the maintainer wants it changed.
- **A2 and B2 together:** with the maintainer's B2 decision, a narrow half is no longer a question, so A2's "one
  question" is the separate-room question carrying the size warning; the "Use the whole cell for Bedroom 2" answer
  remains only for a half under 2'-6" (an older draft divided on a 25 ft plot).
- **Plots offered halves:** "every half at least 2'-6" clear", which gives the same answer as before for every plot
  width the foundation offers (20 and 25 ft no, 30 ft and wider yes).
- **Placing on an occupied half asks first** ("Replace Bathroom with Kitchen + Store in the right half? Bathroom has no
  other part, so it is removed."), as a whole cell does; Refine's picker now says "… removed." when its choice
  removes a room, which it used to do silently.
- **A divided cell stays one gaze target on the map:** the Tobii measurement the handoff asks for before splitting it
  could not be made here.
- **D2 warms imports and fonts; the first model is still about 0.4-0.6 s on this laptop** because building the plan
  itself takes that long (a different plan, after the warm-up, took 0.39 s); that is the plan's work, not loading.

Checks run on this laptop (all against the changed code unless said):

- `npm run check:compass` parts: plan 68, Refine rules 87, saved legacy plans 3, transport 16, saving 23, memory 18: pass.
- `node scripts/check-design-map-actions.cjs`: pass (Playwright's headless shell through a local `PLAYWRIGHT_MODULE` shim).
- `node scripts/check-compass-studio-v2.cjs`, full matrix (1366 and 1920, Focus and Serene, three themes) against
  the real floor-plan service: 100 studio screens, 5,697 gaze target probes, pass (after the N3 fix; before it, the
  final "Closing releases the image" failed once, see N3).
- `node scripts/check-design-browser-dwell.cjs` on all eight Compass screens (map 22, nav 10, rooms 13, rooms-2 14,
  refine 18, refine-focus 4, refine-assign 13, place-half 6 selections): pass, after a fix to the check itself: the
  45-second quiet timer could end READY or Refine inside the 11th case, which also failed on `1263eed` here (run from
  a temporary worktree); each case now re-arms through the real control first.
- `scripts/check-design-layout.cjs`: 12 combinations (1366 and 1920, Focus and Serene, Dark, Warm and Midnight Navy),
  82 screens each, including `compass-place-half`, `compass-place-question` and `compass-road-notice`: 0 issues in
  every combination (984 screens). A measurement outside the audit then found the longest road message (a 20 ft
  plot's reason) squeezed into 207 px and reaching the road's bottom edge at 1366 x 768: an old inline 44 % width
  cap applied inside the road's grid column. A notice now uses the whole column (two lines, inside the road, clear of
  READY and the room box at 1366 x 768 and 1920 x 1080), and the audit was run again for those screens.
- `python -m unittest discover -s tests` (from `python/`): 257 tests, all pass except `test_ml_training_data`
  (`torch` is not installed; unchanged).
- `npm run lint` cannot run in this checkout: there is no ESLint configuration (unchanged). `tsc --noEmit` for the
  interface and `tsc -p tsconfig.electron.json` pass.

Not checked here:

- **The Tobii itself.** Every gaze step above was synthetic gaze through the real cursor; no person used the tracker.
  The maintainer should run scenarios 1-7 by eye, at 100 %, 125 % and 150 % display scaling (the agent may not
  change Windows display settings), and decide then whether a divided cell's halves can be separate targets.
- **The installer.** `build-installer.bat` and the frozen self-test were not run on 16 Oct for this change. The
  frozen service gets the thread limit from Electron's spawn and from `floorplan_server.py`; the entry's `--self-test`
  imported shapely (numpy) before `floorplan_server` and so committed the 225 MB anyway (274.8 MB private in
  `check-windows.bat`), until `scripts/windows/floorplan_entry.py` set the limit first as well (then 50.1 MB).
- **A cold start after a reboot** (antivirus scanning the bundle): measured warm here only.
