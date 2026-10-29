# .NET 10 eye-tracker helper: validation report, 28 October 2026

**Branch:** `ui/aac-visual-exploration`
**Change tested:** `37915fa` "Build the eye-tracker helper on .NET 10" (TobiiGazeHelper retargeted from
`net8.0-windows` to `net10.0-windows`, still self-contained x64; no C# change). The app runs also include
`fa3d5c0` (backend on Python 3.13.17).

This records what was measured on **one Windows 11 laptop with the physical Tobii Eye Tracker 5**, with the
.NET 8 build of the same source measured in the same sitting as the comparison. It is not Windows 10
evidence, not clean-machine evidence, and not a certification of accuracy, latency or safety.

## 1. Machine and builds

| Item | Value |
| --- | --- |
| OS | Windows 11 Home Single Language 25H2, build 26200, x64 |
| CPU | Intel Core i5-1135G7 (supports hardware-enforced stack protection, CET) |
| Tobii software | "Tobii Experience Software For Windows (EyeTracker5)" 4.183.0.30025, "Tobii Experience Software For Windows" 4.72.0.29983, Tobii Eye Tracking Portal 1.69.32600.0 |
| Tobii drivers | EyeChip (WinUSB) 2.5.0.5602, Eye Tracker 5 software device 1.133.0.30004 |
| .NET 10 helper | SDK 10.0.403, runtime 10.0.14 (latest 10.0 release, 25 Oct 2026), 198 files, 81.7 MB |
| .NET 8 helper | the 16 Oct 2026 build of the same source, SDK 8.0.425, runtime 8.0.31 |
| Display | 1920x1080, 100 % scaling |
| Power | Modern Standby; screen off and standby after 10 min without keyboard or mouse input on mains power (3 min on battery); on mains power throughout |

The .NET 10 helper that was measured, the development build `start-dev.bat` runs and the helper inside the
installer candidate (`release\20261028-073240-6d19c798`) are byte-identical (`TobiiGazeHelper.dll`,
`coreclr.dll`, `System.Private.CoreLib.dll`, `Tobii.Interaction.Net.dll`).

## 2. Build and automated checks

| Check | Result |
| --- | --- |
| `setup.bat` (helper build) | exit 0; 0 warnings, 0 errors |
| `build-installer.bat` | exit 0; stage and packaged checks passed, including the `net10.0` target check; local validation candidate only |
| `check-windows.bat` | exit 0 (new SDK check and helper path) |
| Python suite | 284 tests; only `test_ml_training_data` errors (no `torch`), as before |
| `npm run build:electron`, `npm run check:word-slots` | pass (76 + 18) |
| `test_verify_windows_bundle.py` | 14/14 |
| Gaze transport tests on Python 3.13.17 | 16/16 |

## 3. Tracker results (28 Oct: seated 16:26-16:45, unattended 16:59-18:59)

### 3.1 Six-point alignment

`tools/gaze_fixation_capture.py --quick` (60 px inset, 1.2 s settle, 3 s recorded, about 100 valid samples per
point), run in the order .NET 10, .NET 8, .NET 10. Median error per point, px:

| Point | .NET 10 (a) | .NET 8 | .NET 10 (b) | 20 Sep, .NET 8 |
| --- | ---: | ---: | ---: | ---: |
| Centre | 10.8 | 8.7 | 9.0 | 16.4 |
| Top left | 58.8 | 43.5 | 44.9 | 52.8 |
| Top right | 36.6 | 54.9 | 37.9 | 36.3 |
| Bottom right | 11.6 | 18.9 | 4.2 | 40.2 |
| Bottom left | 8.8 | 32.5 | 21.8 | 108.3 |
| Centre again | 8.8 | 4.2 | 20.5 | 26.1 |
| **Median / worst** | **11.2 / 58.8** | **25.7 / 54.9** | **21.1 / 44.9** | **38.2 / 108.3** |

No sample fell outside the screen. The helper forwards the engine's coordinates unchanged, and no point is
consistently better on either build: the differences are the sitting. The 20 Sep run used the vendor's lightly
filtered stream (the helper requests the unfiltered stream since 21 Sep) and an earlier calibration.

### 3.2 Sample rate and delivery

| | .NET 10 (a) | .NET 8 | .NET 10 (b) |
| --- | ---: | ---: | ---: |
| Valid samples | 979 | 921 | 922 |
| Rate | 33.1 Hz | 33.1 Hz | 33.1 Hz |
| Interval median / p95 / p99 (ms) | 30.2 / 32.5 / 34 | 30.2 / 32.4 / 34 | 30.2 / 31.6 / 34 |
| Gaps of 150 ms or more | 0 | 0 | 0 |
| Samples superseded before sending | 0 | 0 | 0 |

Delivery from the helper to a local client (outside the reconnect window in 3.3): median under 0.5 ms, p95
about 1 ms on both builds. These were measured with Python 3.12's wall clock, which moves in steps of up to
about 1 ms, so sub-millisecond differences carry no meaning.

### 3.3 Unplug and reconnect

A full-screen guide told the operator when to unplug and replug the USB cable; a standalone helper ran under
a probe for 95 s.

| Run | Device back (`Initializing`) | `Tracking` | First valid sample | Device back to gaze |
| --- | ---: | ---: | ---: | ---: |
| .NET 10, first | 75.69 s | 77.15 s | 77.54 s | 1.85 s |
| .NET 8 | 39.03 s | 39.92 s | 40.04 s | 1.01 s |
| .NET 10, repeat | 40.09 s | 41.07 s | 41.58 s | 1.49 s |

In every run the helper kept its process, made no stall recovery, and sent **no valid sample while the tracker
was unplugged**. Most of the time to gaze is the Tobii engine bringing the device back (`Initializing` to
`Tracking`). On 20 Sep, gaze returned about 3 s after the physical replug (measured from the cable, with
one-second resolution).

The first .NET 10 run had one 6-second window, 4-10 s after the replug, of irregular delivery: the helper's own
callback intervals reached p95 67 ms, delivery up to 107 ms, and 9 samples were superseded. It was clean before
the unplug and in the first 3 s after the replug. The window coincided with Windows activity (the tracker's
software device re-created 16:29:05.7, a Thunderbolt controller power-state change 16:29:09, another .NET
program's events 16:29:15 and 16:29:20); the .NET 8 run had a smaller window right after its start (delivery up
to 32 ms). The repeat .NET 10 run, made while another session's installer build loaded the machine (system CPU
median 31 %, p90 53 %), was clean for the 54 s after the replug: interval p95 31 ms, delivery max 13.4 ms, none
superseded.

### 3.4 Stalled-stream recovery

`--test-stall-first-host` discards the first `Host`'s samples, so the watchdog has to close it and create a new
one while the operator looks at the screen.

| | Stall detected | New `Host` | Gaze resumed | Stall to gaze |
| --- | ---: | ---: | ---: | ---: |
| .NET 10 | 3,672 ms | 3,732 ms | 3,844 ms | 172 ms |
| .NET 8 | 3,412 ms | 3,478 ms | 3,583 ms | 171 ms |

Closing the old `Host` never hit its 2 s timeout; afterwards both streamed at 33.3 Hz with nothing superseded.

### 3.5 Start-up, CPU and memory

| | .NET 10 | .NET 8 |
| --- | --- | --- |
| `Host` created after process start, tracker attached | 151-646 ms (4 runs; 281 ms in the first pair) | 435-1,242 ms (3 runs; 435 ms in the first pair) |
| Helper CPU while streaming | 3.0-3.7 % of one core | 2.6-4.1 % |
| Helper CPU over 30 min, nobody seated (3.6) | 0.25-0.32 % | 0.24-0.32 % |
| Private memory over a 45-95 s run | up to 24 MB | up to 22 MB |
| Private memory in the 30-min runs: after 10 min / at the end / highest | 20.7 / 19.9 / 21.4 MB and 20.8 / 16.3 / 21.0 MB | 15.5 / 15.4 / 15.7 MB and 14.9 / 16.8 / 16.9 MB |
| Handles / threads | 287-298 / 22-28 (30-min runs: 282-286 / 21-28) | 269-279 / 22-28 (30-min runs: 260-272 / 21-28) |

Private memory rose for the first 10 minutes and then stayed level, or fell after garbage collection, on both
builds; handles stayed flat. Whether it also stays level through an hour of streaming is the open app run.

### 3.6 Two unattended hours, with Modern Standby

Four 30-minute runs, alternating .NET 10, .NET 8, .NET 10, .NET 8 (16:59-18:59), each a standalone helper with a
local client reading every message, while nobody sat at the laptop. Windows put the laptop into Modern Standby on
its idle timeout three times, and someone woke it from the keyboard three times (System log, Kernel-Power 506 and
507). In standby the tracker goes off: the Tobii engine reports it as not connected. Windows kept these standalone helpers running (their
status line never paused), whereas it stops the whole app in standby (`electron/healthRecorder.ts`), so this
shows how the helper follows the tracker going away and coming back, not the app sleeping and waking (section 6).

| Windows event | Build running | What the helper reported, from the event |
| --- | --- | --- |
| Standby 17:08:57 | .NET 10 | tracker off (`Initializing`) after 1.6 s, `DeviceNotConnected` after 2.4 s |
| Wake 17:09:54 | .NET 10 | `Tracking` after 3.7 s, gaze after 4.2 s (someone was looking) |
| Standby 17:20:48 | .NET 10 | off after 1.5 s, `DeviceNotConnected` after 1.9 s |
| Wake 18:12:12 | .NET 10 | `Tracking` after 4.1 s; the engine re-initialised the tracker once more (`Tracking` again after 6.8 s) |
| Standby 18:22:25 | .NET 10 | off after 1.8 s, `DeviceNotConnected` after 2.5 s |
| Wake 18:43:37 | .NET 8 | `Tracking` after 2.4 s; re-initialised once more (`Tracking` again after 22.5 s) |

Both .NET 8 runs and the second .NET 10 run started during standby; each connected to the Tobii engine and
reported `DeviceNotConnected` within 0.8 s. No .NET 8 run was running when the laptop went into standby.

In all four runs the helper sent its status line every second (median 1.02 s, longest gap 1.27 s, during the
18:12 re-initialisation), sent no valid gaze while the tracker was not `Tracking`, made no stall recovery, and
exited with code 0 when its client closed. The single .NET 8 wake brought the tracker back sooner (2.4 s against
3.7 and 4.1 s), as in the reconnect test (3.3). These states are the Tobii engine's, which the helper passes on
as they arrive; with one .NET 8 measurement each the difference is not established. The app runs should record
the time from waking to gaze.

### 3.7 Full application

The maintainer's `start-dev.bat` run (12:53:53-12:58:23; Electron 44.10.0, Python 3.13.17, .NET 10 helper)
streamed tracked gaze with no error, no stall recovery and no helper restart. Its health log shows no stall
events; main-process and interface lag p50 17 ms (p95 18 ms and 117 ms), with the only peaks (1.7 s and 1.9 s)
in the first 15 s of start-up, as in the .NET 8 sessions. It changed `stream_state` between `streaming` and
`no_gaze` 25 times in 4.4 min (5.6 per minute; the .NET 8 run of 24 Oct: 100 in 42.9 min, 2.3 per minute), and
every `no_gaze` spell between two `streaming` ones lasted 1 s or less (11 of 11; .NET 8: 34 of 37). Of its 14
`no_gaze` entries, 4 came in the first 3.5 minutes (1.1 per minute, against 1.5 on .NET 8) and 10 in the last
56 s, which also logged `no_user` twice (someone leaving the tracker). In the seated runs above neither build
had a single gap of 150 ms or more, so the difference followed the user, not the runtime.

## 4. Security and supply chain

- **Hardware-enforced stack protection.** The .NET 10 apphost and `coreclr.dll` are marked CET-compatible (the
  .NET 8 apphost is not). The running .NET 10 helper reports `UserShadowStack: ON`, strict mode off,
  `SetContextIpValidation: ON`. The vendor's native `tobii_stream_engine.dll` and `Tobii.EyeX.Client.dll` are
  not CET-compatible and have no Control Flow Guard (ASLR and NX on); compatibility mode tolerates that, and every
  check in section 3 ran with the protection on. If a machine ever ends the helper with exit code `0xC0000409`,
  setting `<CetCompat>false</CetCompat>` in the project rules this out.
- **Signatures of everything shipped in `resources\tobii-helper`** (195 binaries): 187 valid Microsoft signatures
  (`.NET`, `.NET DAC`, Microsoft Corporation), all 6 Tobii DLLs validly signed by Tobii AB, and only
  `TobiiGazeHelper.exe` and `.dll` unsigned (our build; code signing is still open).
- **Runtime pack:** `microsoft.netcore.app.runtime.win-x64` 10.0.14, downloaded by restore from nuget.org:
  `dotnet nuget verify --all` passes (Microsoft Corporation author signature, NuGet.org repository signature),
  and its content hash equals the one recorded at restore.
- The published runtime never updates itself: rebuild the installer with the latest 10.0 SDK whenever Microsoft
  ships a .NET 10 security update (monthly, on Patch Tuesday).

## 5. Windows support

Microsoft's list for .NET 10 (`dotnet/core` `release-notes/10.0/supported-os.json`, read 28 Oct 2026): Windows 11
24H2, 25H2 and 26H1 (all editions), 23H2 Enterprise only; on Windows 10 only the Enterprise and IoT LTSC
releases (1607, 1809, 21H2). **Windows 10 Home and Pro 22H2 are not supported by .NET 10** (Windows itself ended
their updates on 14 Oct 2025, consumer extended updates on 13 Oct 2026). The helper is expected to run there but
was not tested; test on such a machine before giving the installer to a Windows 10 user. This laptop is
Windows 11 25H2 and supported.

## 6. Still open

1. An hour of normal use of the app with the .NET 10 helper: memory through an hour of streaming (unattended it
   levelled off within 10 minutes, 3.5) and no recurrence of the reconnect window. A read-only monitor records the
   helper's memory, handles and restarts every 30 s until 00:35 on 29 Oct.
2. The app sleeping and waking with the tracker attached: after the wake, gaze should return without restarting
   the app. Windows stops the whole app in standby, unlike the standalone helpers in 3.6, and no such wake has
   been recorded on either build (in the .NET 8 run of 24-28 Oct the tracker reported `DeviceNotConnected` from the
   screen lock onwards, and nothing shows whether it was still attached when the laptop woke).
3. Whether the screen stays on for someone who uses only their eyes. This is not specific to .NET 10: the app holds
   no request to keep the screen on, this laptop enters standby after 10 minutes without keyboard or mouse input
   (3 on battery), and in standby the tracker is off, so gaze cannot wake it. From 18:44 to 19:08 the laptop
   stayed awake for 24 minutes without keyboard or mouse input (the tracker saw someone briefly at 18:52, 18:55 and
   18:59), so something can hold it awake (possibly the Tobii software's presence features); that is not
   established.
4. A Windows 10 22H2 machine, and a clean machine without development tools.
5. Code signing (Smart App Control on a fresh Windows 11 blocks unsigned programs; it is off on this laptop).
6. The laptop still has unpatched .NET installed system-wide: runtimes 5.0.17 and 6.0.x and SDK 6.0.428 (out of
   support), runtime 8.0.11 (many patches behind; .NET 8 itself ends on 10 Nov 2026). GazeConnect does not use
   them (its helper carries its own runtime); remove them in Settings > Apps if nothing else needs them.
