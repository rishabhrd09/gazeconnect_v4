# Compass: left/right and top/bottom halves

Implemented for the maintainer's 30 October 2026 request. Each cell is whole, divided left/right, or divided
top/bottom. A cell has exactly two equal halves; crossing splits and quarter cells are not supported.

## Editing

REFINE → choose a cell → LEFT / RIGHT or TOP / BOTTOM → choose a half → READY → choose its room.
Left/right remains the initial choice when it is usable. On a narrow, deep plot that can only support top/bottom,
the usable direction is selected. A disabled direction explains that its halves would be too narrow.

Top is towards the back of the plot; bottom is towards the road, for every compass facing. The focus view, map
cell, thumbnail, dimensions, speech and upstairs “Below” text follow that arrangement. The map cell remains one
gaze target. The enlarged halves retain the existing dwell category and at least a 40 CSS pixel gap. Direction
buttons are at least 80 CSS pixels high; footer controls retain their existing 104-pixel minimum and clearance.

The choice of direction is a preview. Back changes nothing. The split and its first assignment are one undo step.
Once assigned, the direction controls lock. WHOLE CELL asks which room survives when necessary; it must be used
before changing the direction. Existing replacement, disconnected-room, single-use-room, stair and narrow-room
rules apply. Normal Rooms → READY → a divided cell opens its saved half chooser and asks before replacing a room.

## Saved data and compatibility

The canonical plan keeps the existing `gazeconnect.compass-plan` schema. Version 2 and its left/right meaning,
canonical JSON and geometry remain unchanged. Plans containing top/bottom splits use version 3. Each floor keeps
`splits` as the list of all divided cells, with `splitDirections` containing its top/bottom exceptions:

```json
{
  "splits": ["r2_c2", "r2_c3"],
  "splitDirections": {"r2_c3": "top-bottom"},
  "rooms": [
    {"id": "g-living-1", "use": "living", "regions": ["r2_c2.L", "r2_c2.R", "r2_c3.T"]},
    {"id": "g-bathroom-1", "use": "bathroom", "regions": ["r2_c3.B"]}
  ]
}
```

Missing direction means left/right. `.T` and `.B` are top and bottom; `.L` and `.R` retain their original meaning.
The validators reject the other direction's halves, a whole-cell region in a divided cell, duplicate ownership,
invalid directions and direction entries for undivided cells. TypeScript and Python use the same fixtures.

Draft version 3 uses `gazeconnect_compass_progress_v3`, `compass_persistent_backup_v3` and
`compass_last_session_backup_v3`. A v2 draft is read once into the current state while its originals stay intact.
The v2 migration marker still prevents a retired v1 draft from reappearing after an earlier Restart. Restart in
this version sets `gazeconnect_compass_v3_started`, so old local or backend data cannot undo it. Newer or unreadable
drafts are protected from editing and overwriting, including when a stale session copy contains more rooms.

The backend payload retains the canonical plan under `compass_map.compass_plan`. With no local draft or Restart
marker, the map requests the backend's in-session survey and can restore that canonical plan. Autosave waits out
the existing minimum interval and then saves the latest edit; an edit inside that interval is no longer dropped.
Divided maps continue to refuse the legacy viewer rather than losing their halves in a whole-cell conversion.

## Geometry and outputs

Both schema implementations compute exact region rectangles, positive-length shared edges for connectivity, and
positive-area overlaps between floors. A top half has the larger model y coordinate, because +y points away from
the road. Upstairs halves may overlap two differently divided regions downstairs; every overlapped region must
qualify for Open to below. Whole-cell answers validate the full downstairs area too.

The map, backend copy and studio use one canonical plan. The existing service routes remain
`/api/floorplan/compass/v2/model` and `/api/floorplan/compass/v2/render`; they accept both canonical plan versions.
The shared PlanModel supplies 2D, Top view, Outside, PNG, A3 PDF sheets and DXF R2010 in inches or millimetres.
Orientation participates in the normalized intent and model hash. Existing resource limits, newest-request
replacement, full-screen viewing, downloads and service lifecycle remain in place. The frozen-service self-test
exercises a version 3 top/bottom plan through the same output routes as its original left/right fixture.

## Verification

- `npm run check:compass`: existing plan/reducer/legacy/transport/save/resource checks plus split direction editing,
  undo, compatibility, backend/draft round trips and 6,400 TypeScript/Python region-pair comparisons.
- `npm run check:compass-browser`: original map actions and studio checks plus the new split browser workflow.
  Requires Vite, the local floor-plan service and an existing Playwright installation (`PLAYWRIGHT_MODULE`).
  The new test supports `COMPASS_CHROME_CHANNEL=chrome` for installed Chrome. Browser sessions and survey writes
  are isolated from patient data; the backend boundary is stubbed, while floor-plan requests/downloads are real.
- `python -m unittest discover -s python/tests -p "test_compass_*.py"`, with `PYTHONPATH=python;tools` on Windows:
  original geometry/presentation/views/lifecycle tests plus shared new fixtures and split export verification.
- `scripts/windows/floorplan_entry.py --self-test`, with the same Python module paths: source entry point used by
  the frozen service. Rebuilding an installed executable is a separate packaging step.
- Existing build, layout, dwell and gaze checks remain required. Live Tobii patient validation remains required;
  browser gaze picking and target geometry do not establish tracker accuracy on the rig.

### Results on Windows, 30 October 2026

- `check:compass`: all checks passed, including 6,452 split-specific assertions/comparisons, transport, file-save
  rules and memory/resource rules. The original left/right map-action browser workflow also passed.
- Complete Compass Python suite: **71 tests passed**, including both floors with both split directions,
  positive-area coverage downstairs, actual 2D/Top renders, two-page PDF sheets, and DXF room geometry/units.
- New split browser workflow: passed preview/cancel, assignments, exclusive directions, armed replacement/cancel,
  Undo, Whole Cell direction changes, preserved left/right cells, local/backend-boundary reload, empty divided-cell
  autosave, first-floor editing/switching/reload, actual both-floor 2D generation and five downloaded files.
- New focus layouts: all **12** size/design/theme combinations passed, with additional first-floor checks at both
  sizes. Existing Home/keyboard/Compass layout audit: **192 screens, zero issues or runtime/capture errors**.
- Existing studio regression at both screen sizes (Focus/Warm): **28 screens and 1,737 gaze-target probes passed**,
  including both floors, four outside angles, full screen, PNG/PDF/DXF downloads, memory refusals, cancellation,
  failure/retry, closing while drawing and saved legacy details. Browser generation audits ran sequentially because
  the service deliberately cancels an older preview when another preview is requested.
- Frontend production build, Electron TypeScript build, dwell-group, gaze-safety and gaze-colour checks passed.
  The source frozen-service entry point's self-test passed with both canonical plan versions. Git whitespace
  checks passed. Existing earlier edits in the workspace were retained; no commit, push or installer replacement.
- An initial render timeout while other heavy audits ran did not recur in the isolated viewer run; render limits
  were retained. PDF page-count assertions account for Cairo's compressed PDF object streams.
- Not performed: a rebuilt installer/executable, live Tobii hardware or patient validation. Browser tests stub
  the WebSocket survey/voice boundary and use isolated storage; they do not write the household's survey data.
