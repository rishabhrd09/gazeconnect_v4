# GazeConnect Session Report: Memory, Storage Growth, and Startup Remediation

Date: 2026-03-05  
Scope: Analyze and fix excessive runtime storage growth, memory-risk patterns, and slow startup/black-screen behavior.

## 1) Core problem statement

From runtime logs and app behavior:
- Survey data was being saved too frequently (almost every second), creating very large file counts in `survey_data`.
- Startup had avoidable delays and occasional black-screen wait due to timing/race conditions and unnecessary eager startup work.
- Build packaging risk existed because runtime data/log folders could be unintentionally copied into installer payload.

The practical concern was correct: long-running use could consume significant disk space and degrade reliability for end users.

## 2) Evidence observed

### 2.1 Log evidence (high-frequency writes)

The provided logs showed repeated entries like:
- `Survey data saved ... seq=1,3,5,...`
- `Survey snapshot saved ...` repeatedly in short intervals.

This pattern indicates autosave write loops and missing dedup/rate-limits.

### 2.2 Disk evidence before cleanup

Measured in this session before one-time cleanup:
- `survey_data`: `72,418 files`, `430.85 MB`
- `chat_history`: `4 files`, `32.89 KB`

Main bloat source: `survey_data/sessions/*` and `survey_data/survey_snapshots/*`.

## 3) Root cause analysis (exact files and lines)

## 3.1 Frontend autosave behavior

### Compass map autosave path
- [src/screens/CompassMapScreen.tsx:1277](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1277)  
- [src/screens/CompassMapScreen.tsx:1287](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1287)  
- [src/screens/CompassMapScreen.tsx:1295](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1295)

Risk before fix: autosave+snapshot could retrigger frequently and write large payloads repeatedly.

### Survey screen autosave interval path
- [src/screens/FloorPlanSurveyScreen.tsx:357](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/FloorPlanSurveyScreen.tsx:357)  
- [src/screens/FloorPlanSurveyScreen.tsx:360](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/FloorPlanSurveyScreen.tsx:360)

Risk before fix: unstable dependencies/callback identity could cause save interval churn and unnecessary backend writes.

## 3.2 Backend persistence behavior

### Survey write pipeline
- [python/main.py:1546](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:1546) (`_save_survey`)  
- [python/main.py:1660](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:1660) (`_snapshot_survey`)  
- [python/main.py:1939](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:1939) (`_persist_survey_payload`)

Risk before fix: each call wrote multiple artifacts (main/session/snapshot/summary/index), with no strong dedup/retention.

### Spoken log behavior
- [python/main.py:1418](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:1418) (`_get_chat_history_dir`)  
- [python/main.py:1433](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:1433) (`_prune_spoken_logs`)

## 3.3 Startup sequencing and loading behavior

- [electron/main.ts:1617](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:1617) (`startPythonBackend()` immediate)  
- [electron/main.ts:1620](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:1620) (`createWindow()` immediate)  
- [electron/main.ts:1444](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:1444) (`SPLASH_MIN_DURATION_MS = 10000`)  
- [electron/main.ts:894](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:894) (`app:renderer-ready`)  
- [src/App.tsx:228](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/App.tsx:228) (renderer sends ready signal)

Previous issue: fixed waits + readiness races caused delayed visibility and black-screen transitions.

## 3.4 Installer/data packaging risk

- [build-installer.bat:179](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/build-installer.bat:179)  
- [build-installer.bat:180](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/build-installer.bat:180)

Previous issue: build flow could include runtime data folder content. If developer machine had large logs, installer could ship bloat/stale data.

## 4) What was fixed in this session

## 4.1 Write-frequency and growth controls

- Compass autosave dedup + throttling + source tagging:
  - [src/screens/CompassMapScreen.tsx:86](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:86)
  - [src/screens/CompassMapScreen.tsx:1229](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx:1229)
- Survey autosave stabilized using refs:
  - [src/screens/FloorPlanSurveyScreen.tsx:234](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/FloorPlanSurveyScreen.tsx:234)
  - [src/screens/FloorPlanSurveyScreen.tsx:360](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/FloorPlanSurveyScreen.tsx:360)
- Backend dedup/rate-limit/retention:
  - [python/main.py:135](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:135)
  - [python/main.py:1828](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:1828)
  - [python/main.py:2036](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py:2036)

## 4.2 Startup/perceived performance

- Event-driven splash transition and 10-second welcome target.
- Removed fixed startup delays.
- Lazy floorplan server startup on demand:
  - [electron/main.ts:900](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:900)
  - [src/utils/floorplanApi.ts:21](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/utils/floorplanApi.ts:21)

## 4.3 Runtime storage path hygiene

- Managed runtime paths for packaged app:
  - [electron/main.ts:326](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:326)
  - [electron/main.ts:384](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:384)
- Chat history path in Electron (packaged):
  - [electron/main.ts:1413](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts:1413)

## 5) End-user impact if this had shipped unfixed

If this was shipped as `.exe` installer without these fixes:

1. Rapid disk growth over days of use.
2. Large file counts causing slower file operations and backup sync overhead.
3. Possible UI lag or delayed operations due to frequent IO churn.
4. Longer startup and occasional blank/black transitions due to startup sequencing races.
5. Installer/output bloat risk if developer runtime data accidentally packaged.
6. Ambiguous relative-path writes from Python in production could cause inconsistent storage locations and permission-related failures.

## 6) Where data is stored for installed users (before vs after)

## Before this session's fixes (inference from prior code)

1. Electron chat text:
- `%APPDATA%\\GazeConnect Pro\\chat_history\\chat_YYYY-MM-DD.txt`  
  (from `app.getPath('userData')` in Electron main process)

2. Python survey/data (relative paths):
- `./survey_data`
- `./data`

In packaged builds, relative paths depend on process working directory and can vary by launch context. This is risky for predictable operations.

## After this session's fixes

1. Python managed runtime data (packaged mode):
- `%APPDATA%\\GazeConnect Pro\\runtime-data\\survey_data`
- `%APPDATA%\\GazeConnect Pro\\runtime-data\\data`

2. Electron chat text remains:
- `%APPDATA%\\GazeConnect Pro\\chat_history`

This gives predictable, user-writable storage and avoids installation-directory write issues.

## 7) One-time cleanup done in this session

Cleanup utility added:
- [tools/cleanup_runtime_data.py:181](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/cleanup_runtime_data.py:181)

Actual cleanup execution result:
- Before: `survey_data` = `72,418 files`, `430.85 MB`
- Deleted: `70,063 files` (`415.89 MB` scheduled)
- After: `survey_data` = `2,355 files`, `14.96 MB`
- Archive created:
  - `tools/reports/cleanup_archive_20260305_055425.zip` (~92.4 MB)
- Reports:
  - `tools/reports/cleanup_report_20260305_055353.json` (dry-run)
  - `tools/reports/cleanup_report_20260305_060333.json` (apply)

## 8) Soak monitoring tooling added

Soak monitor script:
- [tools/run_soak_monitor.ps1:1](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/tools/run_soak_monitor.ps1:1)

Quick validation run completed:
- Summary: `tools/reports/soak_summary_20260305_060745.txt`
- CSV: `tools/reports/soak_metrics_20260305_060745.csv`

Operational guide added:
- [docs/runtime-storage-and-soak-guide.md:1](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/docs/runtime-storage-and-soak-guide.md:1)

## 9) Current residual risks and next checks

1. A full 30-minute soak should still be run while actively using Floor Plan, Compass, Web, and Keyboard screens.
2. Validate packaged `.exe` behavior on a clean Windows user profile to confirm all writes go to `%APPDATA%\\GazeConnect Pro\\runtime-data`.
3. Track long-session memory trend from soak CSV and ensure no monotonic runaway.

## 10) Updated retention policy (finalized after this report)

The project policy was tightened after this report was drafted:
1. Keep only last **2** survey sessions.
2. Keep only last **5** keyboard chat files (`chat_*.txt`).
3. Keep **3** global snapshot files (`survey_data/survey_snapshots`).
4. Keep max **120** files per kept session folder (`survey_data/sessions/<session_id>`).
5. Keep **0** spoken logs (disabled).
