# Home Design Module (Client + Developer Guide)

Status: Active  
Scope: Survey + Compass Map + Floor Plan generation in the installed app.

## 1) What the Module Does

Home Design lets user:
1. Capture requirements in Survey.
2. Build room layout in Compass map.
3. Generate a professional 2D floor plan.
4. Download final plan files.

## 2) High-Level User Journey

1. User fills Survey (optional but recommended).
2. User maps rooms in Compass screen.
3. User clicks **Generate Floor Plan**.
4. Viewer shows generated plan (style/floor toggles).
5. User downloads PNG/PDF/SVG if permanent copy is needed.

## 3) Current Production Architecture

### Frontend

1. [CompassMapScreen.tsx](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx): map editing, autosave draft, generate trigger.
2. [FloorPlanViewerModal.tsx](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/components/FloorPlanViewerModal.tsx): preview, style switch, download actions.
3. [floorplanApi.ts](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/utils/floorplanApi.ts): calls `POST /api/floorplan/generate-advanced`.

### Backend

1. [floorplan_server.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_server.py): Flask API and temp cache management.
2. [floorplan_fusion_v1.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_fusion_v1.py): merges survey + compass data.
3. [gazeconnect_floorplan_v5.py](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/gazeconnect_floorplan_v5.py): parse/render pipeline used by server.

## 4) Compass Resume and Data Safety

### What is saved automatically

Compass draft state is saved continuously to:
1. `sessionStorage` key `gazeconnect_compass_progress_v1`
2. `localStorage` key `compass_persistent_backup` (primary)
3. `localStorage` key `compass_last_session_backup` (fallback)

Code:
1. [CompassMapScreen.tsx:1059](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1059)
2. [CompassMapScreen.tsx:1064](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1064)
3. [CompassMapScreen.tsx:1068](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1068)

### How restore works

1. On app launch, screen auto-restores from saved draft if present.
2. User can also click **LOAD PREVIOUS SESSION** for manual restore.
3. After accidental restart, app can still restore from last-session fallback backup.

Code:
1. [CompassMapScreen.tsx:981](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:981)
2. [CompassMapScreen.tsx:1737](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1737)
3. [CompassMapScreen.tsx:2475](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:2475)
4. [CompassMapScreen.tsx:1349](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1349)

## 5) Generated File Persistence

Important behavior:
1. Generated preview is temporary cache.
2. Permanent file exists only after explicit download.

Temporary cache location:
1. `%TEMP%\gazeconnect_floorplans`

Code:
1. [floorplan_server.py:50](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/floorplan_server.py:50)
2. [FloorPlanViewerModal.tsx:230](/C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/components/FloorPlanViewerModal.tsx:230)

## 6) Storage and Cleanup Controls (Current)

### Survey/chat retention

1. Keep only last 2 survey sessions.
2. Keep max 120 files per kept session.
3. Keep max 3 global snapshots.
4. Keep max 5 keyboard chat files.
5. Spoken logs disabled.

### Floorplan temp retention

1. Keep max 20 temp files.
2. Keep max 5 v5 temp folders.
3. Cleanup runs at server start and after generation endpoints.

## 7) What Is Not in Runtime Flow

These are not part of normal end-user Generate button flow:
1. `cleanup_runtime_data.py` (maintenance utility)
2. `run_soak_monitor.ps1` (monitoring utility)

## 8) Client-Friendly Bottom Line

1. User work in Compass map is recoverable after accidental close in normal conditions.
2. Generated plan preview is not a permanent project file unless user downloads.
3. Storage growth is now bounded by retention and temp cleanup caps.
