# TobiiGazeHelper

A Windows x64 bridge from the legacy Tobii.Interaction SDK to GazeConnect's Python backend over loopback TCP port 5555. It receives SDK callbacks at the rate delivered by the hardware/driver; the application must not assume every tracker always delivers a fixed sample rate.

The project targets **.NET 8**, publishes its own runtime and deliberately disables trimming and single-file publishing for compatibility with vendor reflection/native loading. Microsoft's .NET 8 support ends on **10 November 2026**; a supported successor and hardware verification are required before shipping beyond that date. The change from .NET 6 still needs a native Windows build and Tobii smoke test.

## Local build inputs

The six DLLs currently under `TobiiGazeHelper/lib/` are vendor build inputs:

- `Tobii.Interaction.Net.dll`
- `Tobii.Interaction.Model.dll`
- `Tobii.EyeX.Client.dll`
- `Tobii.EyeX.Common.dll`
- `tobii_stream_engine.dll`
- `Tobii.Tech.NETCommon.ClrExtensions.dll`

Their presence in Git does **not** establish permission for public GitHub hosting, redistribution, or AAC use. Do not obtain replacement binaries from OptiKey or another application's installation. Obtain the approved package from Tobii and retain its license and provenance. See [the release audit](../docs/windows-release-audit.md).

For an authorized local SDK package, from the repository root:

```powershell
.\copy-tobii-dlls.bat -SourceDirectory "C:\Path\To\Approved\Tobii\Package"
```

The script checks that the full expected set exists and that native libraries are x64 before replacing local inputs. It does not register DLLs, alter PATH, install drivers, or grant redistribution rights. Version compatibility and transitive native dependencies still require Windows testing; architecture/hash checks alone do not prove authenticity or compatibility.

## Build and publish

```powershell
dotnet build tobii-helper\TobiiGazeHelper\TobiiGazeHelper.csproj -c Release -r win-x64
dotnet publish tobii-helper\TobiiGazeHelper\TobiiGazeHelper.csproj -c Release -r win-x64 --self-contained true -o tobii-dist
```

Development output: `TobiiGazeHelper/bin/Release/net8.0-windows/win-x64/TobiiGazeHelper.exe`.

Use `build-installer.bat` for a complete installer candidate, including Python and frontend assets. End users of a validated installer should not need Node, Python or a separately installed .NET runtime. They still need the compatible Tobii device driver/Experience installation and successful display setup/calibration. A development machine's successful build does not verify those clean-machine requirements.

Avoid competing gaze-to-mouse software during app-owned gaze selection. Plug/unplug, tracking loss, screen scaling, sleep/resume and reconnect must be included in native acceptance tests.

## Status messages and stalled-stream recovery

The SDK delivers no gaze callback while nobody is looking, so silence alone says nothing. Besides `gaze` lines the helper sends a `status` line on every change and once a second, carrying what the Tobii engine itself reports: `connection`, `device_status`, `user_presence`, `gaze_tracking`, and a derived `stream_state`:

| `stream_state` | Meaning |
| --- | --- |
| `streaming` | Gaze samples are arriving. |
| `no_user` / `no_gaze` | Tracker healthy; no eyes detected / eyes present but gaze not on the screen. Normal, never "repaired". |
| `tracking_paused`, `device_not_connected`, `device_unavailable`, `engine_unavailable` | Tracking paused in Tobii Experience, tracker unplugged, tracker not ready, Tobii software not running. |
| `stalled` / `recovering` | The engine reports gaze **is** tracked, continuously for 3 s, yet no sample arrives. |

Only `stalled` is treated as a fault: the helper re-creates its Tobii `Host` with backoff (6, 12, 24, 30 s) and, after four attempts, exits with code 3 so the app's supervisor starts a clean process. The backend forwards the state to the interface, which explains why gaze is absent instead of going quiet.

- `GAZE_HELPER_WATCHDOG=0` reports state but never re-creates the `Host` (diagnostics, rollback).
- The helper requests Tobii's **unfiltered** gaze stream. The vendor's `LightlyFiltered` smoothing costs latency: on live recordings (21 Sep 2026) a real eye movement took a median 91 ms (p90 241 ms) to cross in the lightly filtered stream and 62 ms (p90 182 ms) unfiltered, and the maintainer judged the unfiltered stream the faster one on the tracker. The backend's estimator is noise-aware and, on this stream only, waits one sample (25 ms) before following a jump, which hides the single-sample glitches the raw stream carries. `GAZE_HELPER_STREAM=lightly_filtered` is the way back; `status.stream_mode` reports which one is active, and `tools/gaze_live_observer.py` compares them on a running session.
- `--test-stall-first-host` discards the first `Host`'s samples so the recovery can be exercised on a live tracker. Never use it outside a test.

The helper still serves exactly **one** TCP client and drops the previous one on a new connection. Do not connect a second consumer to port 5555, even to probe it, while the app is running; `tools/gaze_fixation_capture.py` checks the port by binding for this reason.
