# TobiiGazeHelper

.NET 6.0 bridge between the Tobii Eye Tracker 5 hardware and the GazeConnect Pro Python backend.

## How It Works

1. Connects to the Tobii Eye Tracker 5 via the Tobii.Interaction SDK
2. Receives raw gaze data at 133Hz
3. Normalizes coordinates to 0.0-1.0 range
4. Filters frozen/invalid gaze frames
5. Sends gaze data to Python backend via TCP on port 5555

## Tobii DLLs

All required Tobii DLLs are bundled in the `lib/` folder:

| DLL | Purpose |
|-----|---------|
| `Tobii.Interaction.Net.dll` | Managed SDK for gaze streams |
| `Tobii.Interaction.Model.dll` | Data model types |
| `Tobii.EyeX.Client.dll` | Native EyeX client library |
| `Tobii.EyeX.Common.dll` | Common types |
| `tobii_stream_engine.dll` | Low-level stream engine |
| `Tobii.Tech.NETCommon.ClrExtensions.dll` | CLR extension utilities |

These DLLs are referenced locally in `TobiiGazeHelper.csproj` — **no hardcoded system paths**.

To refresh DLLs from a Tobii Experience installation:
```powershell
# From the project root:
.\copy-tobii-dlls.bat
```

## Building

```powershell
cd tobii-helper\TobiiGazeHelper
dotnet build -c Release
```

Output: `bin/Release/net6.0-windows/TobiiGazeHelper.exe`

## Self-Contained Build (for installer)

```powershell
dotnet publish -c Release -r win-x64 --self-contained true
```

This includes the .NET runtime — no .NET SDK required on the target machine.

## Prerequisites

- Tobii Experience must be installed and running
- Eye Tracker must be calibrated
- USB connection to Tobii Eye Tracker 5
