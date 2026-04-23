# Runtime Storage And Soak Guide

This guide helps keep GazeConnect storage bounded and verify long-run behavior.

## 1) One-time safe cleanup

The cleanup tool can:
- archive files that will be removed,
- keep only recent session/snapshot files,
- prune old spoken logs.

### Dry-run (no deletion)

```powershell
python tools/cleanup_runtime_data.py --archive
```

### Apply cleanup

```powershell
python tools/cleanup_runtime_data.py --archive --apply
```

### Useful retention knobs

```powershell
python tools/cleanup_runtime_data.py `
  --archive --apply `
  --keep-sessions 2 `
  --keep-session-files 120 `
  --keep-snapshots 3 `
  --keyboard-chat-keep-files 5 `
  --spoken-keep-days 0 `
  --spoken-keep-files 0
```

Reports and archives are saved under `tools/reports`.

## 2) Soak monitor

The soak monitor logs:
- `survey_data`/`chat_history`/`data` size growth,
- tracked process memory (`electron`, `python`, `TobiiGazeHelper`).

Run while app is open and used normally:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run_soak_monitor.ps1 -DurationMinutes 30 -IntervalSeconds 30
```

Output:
- CSV metrics: `tools/reports/soak_metrics_*.csv`
- Summary: `tools/reports/soak_summary_*.txt`

## 3) Recommended acceptance targets

- Splash appears immediately.
- Transition to home occurs around 10s without black-screen gap.
- `survey_data` growth should stay small during idle navigation (no rapid file explosion).
- Process memory should not show monotonic runaway over 30+ minutes.
