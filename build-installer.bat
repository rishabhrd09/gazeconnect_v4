@echo off
REM ============================================
REM GazeConnect Pro - Build Installer
REM ============================================
REM Creates a standalone Windows installer (.exe)
REM that includes everything needed to run the app:
REM   - Electron app (React frontend)
REM   - Python backend (PyInstaller .exe)
REM   - TobiiGazeHelper (.NET self-contained)
REM   - All Tobii DLLs embedded
REM
REM Prerequisites:
REM   - Node.js 18+, Python 3.10+, .NET 6.0 SDK
REM   - Run setup.bat first
REM
REM Output:
REM   release/GazeConnect Pro Setup *.exe
REM ============================================

setlocal EnableDelayedExpansion

echo.
echo ============================================
echo   GazeConnect Pro - Build Installer
echo ============================================
echo.

set BUILD_ERRORS=0
set START_TIME=%TIME%

REM ---- Verify prerequisites ----
echo [PRE-CHECK] Verifying build tools...

where node >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] Node.js not found!
    set /a BUILD_ERRORS+=1
)

where python >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] Python not found!
    set /a BUILD_ERRORS+=1
)

where dotnet >nul 2>&1
if errorlevel 1 (
    echo   [WARN] .NET SDK not found. Tobii helper won't be built.
    echo          Installer will work but eye tracker requires .NET runtime.
)

if !BUILD_ERRORS! GTR 0 (
    echo [ABORT] Missing prerequisites. Install them and try again.
    pause
    exit /b 1
)

REM Verify venv exists
if not exist "python\.venv\Scripts\python.exe" (
    echo   [FAIL] Python venv not found. Run setup.bat first!
    pause
    exit /b 1
)

REM Verify node_modules exists
if not exist "node_modules" (
    echo   [FAIL] node_modules not found. Run setup.bat first!
    pause
    exit /b 1
)

echo   All checks passed.
echo.

REM ---- Clean previous build artifacts ----
echo [CLEAN] Removing previous build artifacts...
if exist "python-dist" rmdir /S /Q "python-dist"
if exist "tobii-dist" rmdir /S /Q "tobii-dist"
if exist "dist" rmdir /S /Q "dist"
if exist "dist-electron" rmdir /S /Q "dist-electron"
if exist "release" rmdir /S /Q "release"
mkdir python-dist
mkdir tobii-dist
echo   Done.
echo.

REM ============================================
echo [1/5] Building Python backend with PyInstaller...
echo ============================================

REM Activate venv
call python\.venv\Scripts\activate.bat

REM Install PyInstaller if not present
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo   Installing PyInstaller...
    pip install pyinstaller --quiet
    if errorlevel 1 (
        echo   [FAIL] Could not install PyInstaller!
        call deactivate
        pause
        exit /b 1
    )
)

REM Build the Python backend as a single .exe
echo   Running PyInstaller...
pushd python

REM PyInstaller command:
REM   --onefile       : Single executable
REM   --name          : Output name
REM   --distpath      : Output directory
REM   --workpath      : Temp build files
REM   --specpath      : Spec file location
REM   --add-data      : Include services/ folder (+ optional static knowledge JSON if present)
REM   --hidden-import : Ensure all imports are found
REM   --noconfirm     : Overwrite without asking
if exist "..\data\als_knowledge.json" (
    echo   Including optional static knowledge file: ..\data\als_knowledge.json
    pyinstaller ^
        --onefile ^
        --name GazeConnectBackend ^
        --distpath ..\python-dist ^
        --workpath ..\python-dist\build ^
        --add-data "services;services" ^
        --add-data "..\data\als_knowledge.json;data" ^
        --hidden-import websockets ^
        --hidden-import websockets.server ^
        --hidden-import websockets.legacy ^
        --hidden-import websockets.legacy.server ^
        --hidden-import pyttsx3 ^
        --hidden-import pyttsx3.drivers ^
        --hidden-import pyttsx3.drivers.sapi5 ^
        --hidden-import comtypes ^
        --hidden-import pyautogui ^
        --noconfirm ^
        --clean ^
        main.py
) else (
    echo   [INFO] Optional static knowledge file not found ^(..\data\als_knowledge.json^). Building without it.
    pyinstaller ^
        --onefile ^
        --name GazeConnectBackend ^
        --distpath ..\python-dist ^
        --workpath ..\python-dist\build ^
        --add-data "services;services" ^
        --hidden-import websockets ^
        --hidden-import websockets.server ^
        --hidden-import websockets.legacy ^
        --hidden-import websockets.legacy.server ^
        --hidden-import pyttsx3 ^
        --hidden-import pyttsx3.drivers ^
        --hidden-import pyttsx3.drivers.sapi5 ^
        --hidden-import comtypes ^
        --hidden-import pyautogui ^
        --noconfirm ^
        --clean ^
        main.py
)

if !ERRORLEVEL! NEQ 0 (
    echo   [FAIL] PyInstaller build failed!
    popd
    call deactivate
    pause
    exit /b 1
)

popd
call deactivate

REM Clean up PyInstaller temp files
if exist "python-dist\build" rmdir /S /Q "python-dist\build"
if exist "python-dist\GazeConnectBackend.spec" del "python-dist\GazeConnectBackend.spec"
if exist "python\GazeConnectBackend.spec" del "python\GazeConnectBackend.spec"

REM Copy only static JSON data to python-dist (avoid bundling session logs)
if exist "data\als_knowledge.json" (
    if not exist "python-dist\data" mkdir "python-dist\data"
    copy /Y "data\als_knowledge.json" "python-dist\data\als_knowledge.json" >nul
)

if exist "python-dist\GazeConnectBackend.exe" (
    echo   [OK] Python backend built: python-dist\GazeConnectBackend.exe
    for %%A in ("python-dist\GazeConnectBackend.exe") do echo   Size: %%~zA bytes
) else (
    echo   [FAIL] GazeConnectBackend.exe not found after build!
    pause
    exit /b 1
)
echo.

REM ============================================
echo [2/5] Building .NET Tobii Helper (self-contained)...
echo ============================================

REM Check pre-requisites for .NET build
where dotnet >nul 2>&1
if errorlevel 1 goto :skip_dotnet_missing_sdk
if not exist "tobii-helper\TobiiGazeHelper\lib\Tobii.Interaction.Net.dll" goto :skip_dotnet_missing_dlls

if not exist "tobii-helper\TobiiGazeHelper\TobiiGazeHelper.csproj" goto :skip_dotnet_missing_csproj

echo   Publishing as self-contained...
pushd tobii-helper\TobiiGazeHelper

dotnet publish -c Release -r win-x64 --self-contained true -o ..\..\tobii-dist --nologo -v q
if errorlevel 1 goto :dotnet_publish_failed

echo   [OK] Tobii helper built (self-contained).
popd
goto :verify_dotnet_build

:dotnet_publish_failed
echo   [WARN] .NET publish failed. Trying framework-dependent build...
dotnet publish -c Release -r win-x64 --self-contained false -o ..\..\tobii-dist --nologo -v q
if errorlevel 1 goto :dotnet_build_failed_completely

echo   [OK] Tobii helper built (framework-dependent).
popd
goto :verify_dotnet_build

:dotnet_build_failed_completely
echo   [FAIL] .NET build failed completely.
echo   Installer will not include Tobii helper.
popd
goto :skip_dotnet

:skip_dotnet_missing_sdk
echo   [SKIP] .NET SDK not available. Tobii helper not included.
goto :skip_dotnet

:skip_dotnet_missing_dlls
echo   [SKIP] Tobii DLLs not in lib/. Skipping self-contained build.
goto :skip_dotnet

:skip_dotnet_missing_csproj
echo   [WARN] TobiiGazeHelper.csproj not found.
goto :skip_dotnet

:verify_dotnet_build
REM Verify the build
if exist "tobii-dist\TobiiGazeHelper.exe" (
    for %%A in ("tobii-dist\TobiiGazeHelper.exe") do echo   Size: %%~zA bytes
)

:skip_dotnet
echo.

REM ============================================
echo [3/5] Building React frontend (Vite)...
echo ============================================
call npm run build
if !ERRORLEVEL! NEQ 0 (
    echo   [FAIL] Frontend build failed!
    pause
    exit /b 1
)
echo   [OK] Frontend built to dist/
echo.

REM ============================================
echo [4/5] Compiling Electron TypeScript...
echo ============================================
call npm run build:electron
if !ERRORLEVEL! NEQ 0 (
    echo   [FAIL] Electron TypeScript compilation failed!
    pause
    exit /b 1
)
echo   [OK] Electron compiled to dist-electron/
echo.

REM ============================================
echo [5/5] Creating Windows installer (electron-builder)...
echo ============================================

REM Verify the staging directories
echo   Staging check:
if exist "python-dist\GazeConnectBackend.exe" (
    echo     [OK] Python backend ready
) else (
    echo     [WARN] Python backend missing - installer may be incomplete
)
if exist "tobii-dist\TobiiGazeHelper.exe" (
    echo     [OK] Tobii helper ready
) else (
    echo     [WARN] Tobii helper missing - eye tracker won't work
)
if exist "dist\index.html" (
    echo     [OK] Frontend ready
) else (
    echo     [FAIL] Frontend missing!
    pause
    exit /b 1
)
if exist "dist-electron\main.js" (
    echo     [OK] Electron main ready
) else (
    echo     [FAIL] Electron main missing!
    pause
    exit /b 1
)
echo.

REM Run electron-builder
call npx electron-builder --win --x64
if !ERRORLEVEL! NEQ 0 (
    echo   [FAIL] electron-builder failed!
    echo   Check the errors above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   BUILD COMPLETE!
echo ============================================
echo.
echo   Start time:  %START_TIME%
echo   End time:    %TIME%
echo.

REM List the output
echo   Output files in release/:
echo   --------------------------
if exist "release" (
    dir /B "release\*.exe" 2>nul
    dir /B "release\*.msi" 2>nul
    echo.
    for %%f in (release\*.exe) do (
        echo   Installer: %%f
        for %%A in ("%%f") do echo   Size: %%~zA bytes
    )
)

echo.
echo   You can now distribute the installer from the release/ folder.
echo   Users only need Windows 10/11 x64 — no other software required.
echo.
echo   NOTE: Users still need Tobii Experience installed
echo         and a Tobii Eye Tracker 5 connected for gaze input.
echo         The app works in simulation mode without hardware.
echo.
pause
