# GazePlan Engine v5

Additive AI floor-planning engine.  
Used by optional endpoint `POST /api/floorplan/v5/generate` in `tools/floorplan_server.py`.

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
- fallback to seed if OR-Tools unavailable/timeout

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
- `variants`: integer (currently 1)

## Optional dependencies

For full v5 capabilities install:
- `shapely`
- `networkx`
- `squarify`
- `ortools`
- `ezdxf`
