# Home Planning End-to-End Guide (Current Runtime)

Audience:
1. Client stakeholders who need clear behavior expectations.
2. New developers onboarding to Survey + Compass + Floor Plan flow.

This document reflects the current code path after recent storage/startup fixes.

## 1) Runtime Generation Path (What Happens on Generate)

When user clicks **Generate Floor Plan** from Compass map:
1. UI compiles current map payload in [CompassMapScreen.tsx](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx).
2. Viewer calls `generateFloorPlan(...)` in [floorplanApi.ts](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/utils/floorplanApi.ts).
3. API endpoint used: `POST /api/floorplan/generate-advanced`.
4. Flask server handles request in [floorplan_server.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_server.py).
5. Fusion logic runs in [floorplan_fusion_v1.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_fusion_v1.py).
6. Rendering uses `parse()` + `CairoFloorPlan` from [gazeconnect_floorplan_v5.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/gazeconnect_floorplan_v5.py).

## 2) Compass Progress Safety (Accidental App Close)

Compass map resume is implemented in two layers.

### 2.1 Auto-save draft storage

Full draft state is continuously written to browser storage:
1. `sessionStorage` key: `gazeconnect_compass_progress_v1`
2. `localStorage` key: `compass_persistent_backup` (primary backup)
3. `localStorage` key: `compass_last_session_backup` (fallback backup)

Code references:
1. [CompassMapScreen.tsx:83](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:83)
2. [CompassMapScreen.tsx:84](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:84)
3. [CompassMapScreen.tsx:85](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:85)
4. [CompassMapScreen.tsx:1068](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1068)

### 2.2 Restore behavior on next launch

On screen mount, app tries restore in this order:
1. `sessionStorage` draft
2. primary `localStorage` backup
3. fallback last-session backup

Code reference:
1. [CompassMapScreen.tsx:978](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:978)
2. [CompassMapScreen.tsx:981](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:981)

Manual restore path:
1. User can click **LOAD PREVIOUS SESSION**.
2. It picks the best available draft from primary + fallback backup.
3. Restart flow preserves a last-session backup before reset.

Code references:
1. [CompassMapScreen.tsx:1737](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1737)
2. [CompassMapScreen.tsx:2475](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:2475)
3. [CompassMapScreen.tsx:1349](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1349)

## 3) Where Data Is Stored

### 3.1 Draft state (for continue-from-last-state)

Stored in renderer browser storage:
1. `sessionStorage` (same app session)
2. `localStorage` backup (cross-restart)

### 3.2 Survey + compass payload history

Stored by Python backend:
1. `survey_data/gaze_survey_data.json` (latest payload)
2. `survey_data/sessions/<session_id>/*.json` (session history)
3. `survey_data/survey_snapshots/*.json` (global snapshots)
4. `survey_data/session_index.json` (latest session pointer)

Packaged app path (production):
1. `%APPDATA%\GazeConnect Pro\runtime-data\survey_data`

## 4) Generated Floor Plan Files: Temp vs Permanent

### 4.1 In-app preview generation

Rendered files are temporary cache:
1. `%TEMP%\gazeconnect_floorplans`

Code reference:
1. [floorplan_server.py:50](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_server.py:50)

### 4.2 Permanent user file

Permanent file exists only when user downloads from viewer.

Code reference:
1. [FloorPlanViewerModal.tsx:230](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/components/FloorPlanViewerModal.tsx:230)

## 5) Memory/Storage Controls Now Active

### 5.1 Survey and chat retention

Configured in backend:
1. Keep last `2` survey sessions.
2. Keep max `120` files per kept session.
3. Keep max `3` global survey snapshots.
4. Keep max `5` keyboard chat logs.
5. Keep `0` spoken logs.

### 5.2 Temp floor-plan retention

Configured in floorplan server:
1. Keep max `20` flat temp files (`png/pdf/svg/dxf`).
2. Keep max `5` `v5_*` output folders.
3. Cleanup runs on startup and after generation endpoints.

Code reference:
1. [floorplan_server.py:385](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_server.py:385)

## 6) Which Tools Are Runtime-Critical vs Operations

Runtime-critical for end users:
1. [floorplan_server.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_server.py)
2. [floorplan_fusion_v1.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_fusion_v1.py)
3. [gazeconnect_floorplan_v5.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/gazeconnect_floorplan_v5.py)

Operations/testing tools (not required for normal Generate button):
1. [cleanup_runtime_data.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/cleanup_runtime_data.py)
2. [run_soak_monitor.ps1](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/run_soak_monitor.ps1)

## 7) Quick FAQ

1. If app closes accidentally, can user continue Compass map?
Yes. Draft state restore is implemented (auto + manual backup load).

2. Is last generated image auto-kept forever?
No. It is temp unless user downloads.

3. Can temp cache grow forever?
No. Server temp cleanup caps are in place.
