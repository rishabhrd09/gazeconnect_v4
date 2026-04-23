# Latest Script Quick Start

Use this runbook for current floor-plan and storage tooling.

## 1) One-time setup

From repo root:

```powershell
.\setup.bat
```

Always use:

```powershell
python\.venv\Scripts\python.exe
```

## 2) Scripts in active use

- `tools/floorplan_server.py`
  - Flask API used by the app (`/api/floorplan/generate-advanced`, port `5050`).
- `tools/floorplan_fusion_v1.py`
  - Merges compass map + survey data + optional notes before rendering.
- `tools/gazeconnect_floorplan_v5.py`
  - Current renderer/parser used by server and CLI smoke tests.
- `python -m gazeplan_engine_v5.cli`
  - Optional advanced CLI generator from `survey_data` sessions.
- `tools/cleanup_runtime_data.py`
  - Runtime storage cleanup utility.
- `tools/run_soak_monitor.ps1`
  - Runtime memory/storage monitoring utility.

## 3) Canonical commands

### 3.1 Start app (recommended runtime path)

```powershell
.\start-dev.bat
```

Notes:
- Python backend starts immediately.
- Floor plan server starts lazily when first floor-plan request is made.

### 3.2 Renderer smoke (direct CLI)

```powershell
python\.venv\Scripts\python.exe tools\gazeconnect_floorplan_v5.py --sample --all-styles -o output\floorplan_v5_smoke
```

### 3.3 Latest saved data render (direct CLI)

```powershell
python\.venv\Scripts\python.exe tools\gazeconnect_floorplan_v5.py --latest --all-styles --dxf -o output\floorplan_v5_latest
```

### 3.4 Optional v5 engine CLI

```powershell
python\.venv\Scripts\python.exe -m gazeplan_engine_v5.cli --auto --source both --style both --format png --output output\floorplan_v5_engine
```

## 4) Session-safe behavior (current)

Primary storage:
- `survey_data/sessions/<session_id>/*.json`
- `survey_data/session_index.json`
- `survey_data/gaze_survey_data.json`

Retention defaults in backend:
- keep last `2` survey sessions,
- keep max `120` files per kept session folder,
- keep max `3` global snapshots,
- keep last `5` keyboard chat files,
- keep `0` spoken logs.

## 5) Output path clarification

- App UI generation temp cache:
  - `%TEMP%\gazeconnect_floorplans`
- App permanent user export:
  - only when user clicks download in viewer modal
- Script output:
  - the path passed with `-o` or `--output`

