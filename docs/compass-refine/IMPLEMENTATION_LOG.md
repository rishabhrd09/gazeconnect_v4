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
