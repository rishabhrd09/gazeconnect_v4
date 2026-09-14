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
