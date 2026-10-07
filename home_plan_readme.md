# Home Plan Module README

> **Current Compass viewer (5 Oct 2026):** the generated-plan studio (`src/components/CompassPlanStudio.tsx`) uses `POST /api/floorplan/compass/options` and `/compass/render` in `tools/floorplan_server.py`, which call `tools/compass_presentation.py` (model, render, DXF) with `compass_architecture.py`, `compass_furniture.py`, `compass_standards.py`, `compass_drawing.py` and `compass_exterior.py`. See AGENTS.md (Compass bullets). The path below is the legacy survey/fusion viewer, kept for saved plans.

This file gives a compact technical map of Survey + Compass + Floor Plan generation.

## What the app uses in production

When user clicks **Generate Floor Plan** inside Compass/Survey flow:

1. `src/utils/floorplanApi.ts`
2. `POST /api/floorplan/generate-advanced`
3. `tools/floorplan_server.py`
4. `tools/floorplan_fusion_v1.py`
5. `tools/gazeconnect_floorplan_v5.py`

This is the stable in-app path.

## Where data is saved

Primary files:
- `survey_data/gaze_survey_data.json`
- `survey_data/gaze_survey_compiled.json`
- `survey_data/gaze_survey_summary.txt`
- `survey_data/survey_snapshots/*.json`

Session-safe history:
- `survey_data/sessions/<session_id>/*.json`
- `survey_data/session_index.json`

Each save includes `session_id`, `save_seq`, `save_id`, and timestamp.

## Where generated files appear

- In-app preview files: `%TEMP%\\gazeconnect_floorplans`
- Manual script output: your `-o output\\...` target folder

So `output/` being empty is normal for app-only runs.

## External scripts (developer/advanced)

- `tools/gazeconnect_floorplan_v5.py` (current renderer CLI)
- `python -m gazeplan_engine_v5.cli` (optional advanced optimizer CLI)
- `tools/cleanup_runtime_data.py` (runtime cleanup utility)
- `tools/run_soak_monitor.ps1` (runtime soak monitor utility)

## Session safety behavior

- `--source compass`: latest session with compass data
- `--source survey`: latest session with survey data
- `--source both`: one session only, no cross-session mixing
- Optional pin: `--session-id <id>`

## Recommended docs

- `docs/home-planning-end-to-end-guide.md` (full technical flow)
- `docs/latest-script-quick-start.md` (all commands)
- `docs/floorplan-end-user-guide.md` (installed-app user flow, no scripts)
