# GazePlan Engine v5

Additive AI floor-planning engine.  
Used by optional endpoint `POST /api/floorplan/v5/generate` in `tools/floorplan_server.py`.

## Compass Map review candidates

`generate_layout_candidates(compass_map, max_candidates=4, timeout_seconds=8)`
returns up to four deterministic, distinct, validated alternatives. The first
candidate is the exact selected-cell layout. Subsequent candidates make bounded
0.8 ft changes to a shared wall, favoring room balance, circulation space, or
private rooms. They preserve room identities, cell ownership, plot geometry,
and stair locations. A profile is omitted if it is a duplicate or fails checks.
The candidate count can therefore be smaller than four.

Each candidate includes a full `compass_map` ready for the existing renderer,
floor-local `placements` with stable `placementId`, original `cells`, and exact
`geometryRects`; `doorOpenings` contains validated opening spans. `changes`
records measured per-room area deltas. `allowed_adjustments` lists room edges
for which a 1 ft expansion was simulated successfully. Use
`adjust_layout_candidate(compass_map, {floor, placementId, action: "room_size",
direction, amount_ft})` for an explicit 1 or 2 ft expansion. Stair and access
edits are not exposed until their geometry can be checked end to end.

The validator checks plot containment, occupied-cell anchors, minimum usable
room area and rectangle dimensions, exact coverage without overlap or claiming
unassigned cells, a 3 ft door-opening route through the selected Left, Center,
or Right main gate or a stair landing, and a common 3 × 6 ft preliminary stair
footprint between floors. It treats empty cells as
unassigned, never as implicit corridors. These are preliminary geometry checks,
not a licensed architectural or building-code review. Existing nonempty
`advanced_refinements` are rejected for candidate generation until they can be
migrated to exact candidate geometry; the original plan remains available
through the legacy render path.

## Pipeline modules

1. `nbc_standards.py`
- NBC 2016 minimum constraints
- accessibility overrides
- feasibility pre-check

2. `vastu_scoring.py`
- directional Vastu scoring + weighted score (0-100)

3. `room_adjacency_graph.py`
- adjacency graph from compass placements + defaults/forbidden edges

4. `treemap_seeder.py`
- two-stage zone + room treemap seed layout

5. `constraint_solver.py`
- CP-SAT room optimization (NoOverlap + soft objective)
- returns a seed only as diagnostic data if OR-Tools is unavailable or times out;
  the orchestrator does not render that seed as a successful plan

6. `wall_geometry.py`
- wall extraction (exterior/interior) + optional Shapely union

7. `fenestration.py`
- automatic window/door placement + ventilation checks

8. `renderer_v5.py`
- presentation + technical PyCairo rendering

9. `dxf_exporter_v5.py`
- CAD DXF output with AIA-style layers

10. `engine.py`
- full orchestration and report generation

11. `cli.py`
- standalone CLI entry

## Run

From repo root:

```powershell
python\.venv\Scripts\python.exe -m gazeplan_engine_v5.cli --auto --source both --style both --format png
```

## API

`tools/floorplan_server.py` now includes:
- `POST /api/floorplan/v5/generate`

Accepts same payload family (`compass_map`, optional `survey_data`, optional `user_notes`) with:
- `style`: `presentation|technical|both`
- `format`: `png|pdf|svg|dxf`
- `floor`: `ground|first`
- `variants`: this legacy route supports exactly 1; use the Compass Map
  candidate API for multiple validated layouts

## Optional dependencies

For full v5 capabilities install:
- `shapely`
- `networkx`
- `squarify`
- `ortools`
- `ezdxf`
