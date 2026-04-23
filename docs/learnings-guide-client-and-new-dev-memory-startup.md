# Learnings Guide: Client + New Developer View (Memory, Storage, Startup)

Date: 2026-03-05  
Audience: Client stakeholders, new developers, QA/release team

## 1) Why this guide exists

This guide explains, in simple language and technical language, what happened in this session:
- why disk usage was growing quickly,
- why startup felt slow or showed black-screen waits,
- what was fixed,
- what users would have faced if shipped without fixes,
- how to keep the app lightweight going forward.

## 2) One-line summary

The app was not mainly suffering from classic RAM leak evidence in this session; the primary issue was **disk growth from very frequent survey saves/snapshots**, plus **startup sequencing inefficiencies**. Both were fixed with throttling, dedup, retention, lazy startup, and runtime-path hygiene.

## 3) Client-friendly explanation (non-technical)

Think of the app like a notebook that was writing the same page again and again every few seconds.  
That notebook is the `survey_data` folder.

What this caused:
1. Storage kept increasing quickly.
2. Over time, user systems could feel heavier because too many files were being created.
3. App startup could feel slow due to unnecessary components starting too early.

What we changed:
1. The app now writes only when needed (not repeatedly for unchanged data).
2. Old files are limited and pruned automatically.
3. Heavy floor-plan service now starts only when user actually needs it.
4. Startup is now event-based so the welcome-to-home transition is smoother.

## 4) New developer explanation (technical)

## 4.1 Core root causes

1. Frontend autosave loops produced frequent backend save requests.
2. Backend persistence path wrote multiple artifacts per call.
3. No strong dedup + interval gates at persistence boundary.
4. Startup used fixed timing and eager process startup.
5. Build flow had risk of copying runtime data into package staging.

## 4.2 Exact high-impact files

1. Compass autosave logic:
- [CompassMapScreen.tsx](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/CompassMapScreen.tsx)

2. Survey autosave interval:
- [FloorPlanSurveyScreen.tsx](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/screens/FloorPlanSurveyScreen.tsx)

3. Backend persistence and retention:
- [python/main.py](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/python/main.py)

4. Startup orchestration:
- [electron/main.ts](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/main.ts)

5. Renderer ready signal:
- [src/App.tsx](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/App.tsx)
- [electron/preload.ts](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/electron/preload.ts)

6. Lazy floorplan server startup:
- [src/utils/floorplanApi.ts](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/src/utils/floorplanApi.ts)

7. Installer data filtering:
- [build-installer.bat](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/build-installer.bat)

## 5) Which folders consumed space, and why

## 5.1 Before fixes

1. `survey_data/sessions/*`  
Reason: session artifacts per save/snapshot at high frequency.

2. `survey_data/survey_snapshots/*`  
Reason: snapshots saved repeatedly with no practical cap.

3. `chat_history/*`  
Growth existed but was comparatively small in this case.

Measured before cleanup:
1. `survey_data`: `72,418 files`, `430.85 MB`
2. `chat_history`: `4 files`, `32.89 KB`

## 5.2 After fixes + one-time cleanup

Measured after cleanup:
1. `survey_data`: `2,355 files`, `14.96 MB`
2. `chat_history`: unchanged and small

## 6) Where installed users’ data is stored

## 6.1 What users would have seen previously

1. Electron chat logs:
- `%APPDATA%\GazeConnect Pro\chat_history`

2. Python survey/data:
- `./survey_data`
- `./data`

In packaged apps, relative paths can be inconsistent depending on working directory and launch context.

## 6.2 What users should see now

1. Python managed runtime data:
- `%APPDATA%\GazeConnect Pro\runtime-data\survey_data`
- `%APPDATA%\GazeConnect Pro\runtime-data\data`

2. Electron chat logs:
- `%APPDATA%\GazeConnect Pro\chat_history`

## 7) What would have happened if shipped unfixed

1. Frequent disk growth on active use.
2. Very high file counts over days/weeks.
3. Slower support/backup operations due to folder bloat.
4. Potential user complaints: “app is taking too much space.”
5. Startup perception issues due to process sequencing and race behavior.
6. Packaging risk: installer could carry unnecessary runtime artifacts.

## 8) What exactly was solved

1. Autosave dedup and throttling were added.
2. Snapshot/save intervals and source-aware manual save handling were added.
3. Backend retention pruning limits were added for sessions/snapshots and keyboard chat logs.
4. Spoken log persistence was disabled by default.
4. Startup moved to event-driven flow; fixed waits removed.
5. Floorplan server moved to lazy startup.
6. Runtime data path management added for packaged app.
7. Build script restricted to static knowledge JSON, not runtime logs.
8. Maintenance scripts were added for cleanup + soak monitoring.

## 9) How we now limit storage growth

1. Save only on meaningful data changes.
2. Enforce minimum time gaps between writes.
3. Keep only recent snapshots/session files (last 2 sessions, max 120 files per kept session, max 3 global snapshots).
4. Keep only last 5 keyboard chat files (`chat_*.txt`) for word prediction.
5. Do not retain spoken logs.
6. Keep reports/archives outside git by default.

## 10) Operations runbook (simple)

1. Run dry-run cleanup:
```powershell
python tools/cleanup_runtime_data.py --archive
```

2. Apply cleanup:
```powershell
python tools/cleanup_runtime_data.py --archive --apply
```

3. Run soak monitor during real usage:
```powershell
powershell -ExecutionPolicy Bypass -File tools/run_soak_monitor.ps1 -DurationMinutes 30 -IntervalSeconds 30
```

4. Check outputs:
- `tools/reports/cleanup_report_*.json`
- `tools/reports/soak_summary_*.txt`
- `tools/reports/soak_metrics_*.csv`

## 11) Client communication template (ready to use)

Use this message with non-technical stakeholders:

1. “We found that survey progress was being saved too frequently, which created too many files.”
2. “We added smart save controls so unchanged data is not repeatedly written.”
3. “We added automatic retention so old temporary files do not grow forever.”
4. “We improved startup flow and delayed heavy components until needed.”
5. “We ran cleanup and reduced storage from ~431 MB to ~15 MB in current test data.”

## 12) Developer handover checklist

1. Confirm startup welcome-to-home transition remains smooth (~10s target).
2. Confirm floorplan server starts only on floorplan usage.
3. Confirm packaged build writes Python runtime data under `%APPDATA%\GazeConnect Pro\runtime-data`.
4. Confirm no rapid file explosion in `survey_data` during 30-minute soak.
5. Confirm cleanup/soak reports are generated successfully.
6. Keep `tools/reports/` ignored in git.

## 13) Related documents

1. Detailed remediation report:  
[session-report-memory-startup-remediation-2026-03-05.md](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/docs/session-report-memory-startup-remediation-2026-03-05.md)

2. Runtime operations guide:  
[runtime-storage-and-soak-guide.md](C:/working_build_v1/claude_code_gazeconnect/latest_march_changes/gazeconnect_v3/docs/runtime-storage-and-soak-guide.md)
