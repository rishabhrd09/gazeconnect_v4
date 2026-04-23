# Build and Installation Guide

This guide covers the complete process of building GazeConnect Pro into a standalone Windows installer, and how to distribute and install it on end-user machines.

---

## Overview

The build process merges three separate technologies into a single installer:

| Component | Tool | Input | Output |
|-----------|------|-------|--------|
| Python backend | PyInstaller | `python/main.py` + services | `python-dist/GazeConnectBackend.exe` |
| Tobii helper | dotnet publish | `tobii-helper/TobiiGazeHelper/` | `tobii-dist/TobiiGazeHelper.exe` + DLLs |
| React frontend | Vite | `src/` | `dist/` (HTML/JS/CSS) |
| Electron app | electron-builder | All of the above | `release/GazeConnect Pro Setup *.exe` |

The final installer contains everything. Users do not need to install Python, Node.js, or .NET.

---

## Prerequisites

| Tool | Version | Verify With |
|------|---------|-------------|
| Windows 10/11 | x64 | - |
| Node.js | 18+ | `node --version` |
| Python | 3.10+ | `python --version` |
| .NET 6.0 SDK | 6.0+ | `dotnet --version` |
| Project setup complete | - | `.\setup.bat` has been run |

---

## Quick Build

If you just want the installer and already have the environment set up:

```powershell
.\build-installer.bat
```

Output: `release/GazeConnect Pro Setup *.exe`

### Avoiding Windows Long Path errors

Windows has a 260-character path limit. If your project is deep in `Downloads` or `Documents`, the build may fail with path errors.

Solution: Copy the project to a short path before building:
1. Copy the project folder to `C:\`
2. Rename it to `GC` (path: `C:\GC\`)
3. Open a terminal in `C:\GC\`
4. Run `.\clean.bat` then `.\setup.bat` then `.\build-installer.bat`

---

## Build Process (Step by Step)

`build-installer.bat` runs five internal steps automatically. Here is what each does:

### Step 1: Pre-check

Verifies that `node`, `python`, and `dotnet` are in your PATH. Fails early with a clear message if anything is missing.

### Step 2: Build Python Backend (PyInstaller)

```
Log: "Building Python backend with PyInstaller..."
```

PyInstaller scans `python/main.py`, detects all imports (`websockets`, `pyttsx3`, `asyncio`, etc.), and bundles the Python interpreter + all libraries + your code into a single executable.

**Command** (executed by the script):
```batch
pyinstaller --name GazeConnectBackend --onefile --distpath ..\python-dist ^
    --add-data "services;services" --add-data "..\data;data" ^
    --hidden-import websockets --hidden-import pyttsx3 ^
    main.py
```

- `--onefile`: Creates a single `.exe` instead of a folder
- `--add-data`: Includes non-code files (word lists in `data/`, service modules)
- `--hidden-import`: Forces inclusion of modules that PyInstaller's analysis misses

**Output**: `python-dist/GazeConnectBackend.exe`

### Step 3: Build .NET Tobii Helper (Self-Contained)

```
Log: "Building .NET Tobii Helper (self-contained)..."
```

Compiles the C# code and bundles the .NET 6.0 runtime inside the output folder so users don't need .NET installed.

**Command**:
```batch
dotnet publish -c Release -r win-x64 --self-contained true -o ..\..\tobii-dist
```

- `-r win-x64`: Targets 64-bit Windows
- `--self-contained true`: Includes the .NET runtime DLLs (~60MB)

**Output**: `tobii-dist/` containing `TobiiGazeHelper.exe` + runtime DLLs + Tobii DLLs

### Step 4: Build React Frontend (Vite)

```
Log: "Building React frontend (Vite)..."
```

Compiles TypeScript (`.tsx`) into optimized, minified HTML/CSS/JS.

**Command**:
```batch
npm run build
```

**Output**: `dist/` (static web assets)

### Step 5: Compile Electron + Create Installer

```
Log: "Creating Windows installer (electron-builder)..."
```

electron-builder takes all previous outputs and wraps them into a single NSIS installer:

1. Bundles `dist/` (React UI)
2. Bundles `dist-electron/` (Electron main process)
3. Bundles `python-dist/` (Python backend)
4. Bundles `tobii-dist/` (Tobii helper)
5. Includes Chromium + Node.js runtime (from Electron)
6. Creates the NSIS installer with desktop/start menu shortcuts

**Extra resources configuration** (from `package.json`):
```json
"extraResources": [
  { "from": "python-dist", "to": "python" },
  { "from": "tobii-dist", "to": "tobii-helper" }
]
```

**Output**: `release/GazeConnect Pro Setup *.exe`

---

## What the Installer Contains

| Component | Bundled As | Size (approx) |
|-----------|-----------|----------------|
| Electron + Chromium + Node.js | `GazeConnect Pro.exe` | ~60MB |
| React UI | `dist/` inside app.asar | ~5MB |
| Python backend | `GazeConnectBackend.exe` | ~30MB |
| .NET Tobii helper + runtime | `TobiiGazeHelper.exe` + DLLs | ~25MB |
| Tobii DLLs | In tobii-helper folder | ~5MB |
| **Total installer** | NSIS compressed | **~125MB** |

---

## Distribution

### What to share

Share only the installer file: `GazeConnect Pro Setup *.exe` from the `release/` folder.

Do NOT share: `win-unpacked/`, `builder-debug.yml`, `builder-effective-config.yaml`, `.blockmap` files.

### How to share

- USB drive
- Google Drive / OneDrive
- WeTransfer or similar file transfer service

---

## Installation (End-User Experience)

### User requirements

- Windows 10 or 11 (64-bit)
- Tobii Experience (only if using eye tracker hardware)
- Tobii Eye Tracker 5 (optional, app works in mouse mode without it)

### Installation steps

1. Double-click `GazeConnect Pro Setup *.exe`
2. If prompted "Who should this application be installed for?", select "Only for me"
3. Follow the installer prompts
4. The app installs to `C:\Users\<Name>\AppData\Local\Programs\GazeConnect Pro`
5. A desktop shortcut and Start Menu entry are created

### Running the installed app

- Double-click the "GazeConnect Pro" desktop shortcut, or
- Press Windows key, type "GazeConnect Pro", and press Enter
- The app automatically starts the Python backend and Tobii helper in the background

### Verifying the installation

Open Task Manager and check that these processes are running:
- `GazeConnect Pro` (Electron)
- `GazeConnectBackend` (Python)
- `TobiiGazeHelper` (only if eye tracker is connected)

---

## Build Output Reference

After running `build-installer.bat`, the `release/` folder contains:

| File / Folder | Purpose | Share? |
|--------------|---------|--------|
| `GazeConnect Pro Setup *.exe` | The installer | YES |
| `win-unpacked/` | Uncompressed app (for testing without installing) | No |
| `builder-debug.yml` | Build debug logs | No |
| `builder-effective-config.yaml` | Final electron-builder config used | No |
| `*.blockmap` | Differential update data | No |

---

## Troubleshooting

### "A required privilege is not held by the client"

electron-builder needs symlink permissions.

**Fix 1**: Run your terminal as Administrator (right-click -> Run as Administrator), then re-run `build-installer.bat`.

**Fix 2**: Enable Developer Mode in Windows Settings > Update & Security > For developers.

**Fix 3**: Delete `C:\Users\<YourUser>\AppData\Local\electron-builder\Cache` and retry as Administrator.

### "Cannot find specified resource 'build/icon.ico'"

electron-builder requires an icon file at `build/icon.ico`.

**Fix**: Run `python create_icon.py` to generate a placeholder icon.

### "Python not found" or "pip failed"

Python is not in your PATH.

**Fix**: Ensure `python --version` works in your terminal. Re-run `setup.bat`.

### ". was unexpected at this time"

This was a known bug in older versions of `build-installer.bat`.

**Fix**: Pull the latest version of the script which uses linear logic checks.

### "Tobii DLLs missing"

**Fix**: Run `.\copy-tobii-dlls.bat`, or check that `tobii-helper/TobiiGazeHelper/lib/` contains the required DLLs. Run `dotnet restore` in the TobiiGazeHelper folder if needed.

### Installer runs but eye tracker does not work

1. Check if `TobiiGazeHelper.exe` is running in Task Manager
2. Check logs in `%APPDATA%\GazeConnectPro\logs\`
3. Ensure the user has Tobii Experience installed (the hardware driver)
4. The core USB driver for the tracker must be on the user's system (usually auto-installed by Windows when the device is plugged in)
