@echo off
setlocal EnableDelayedExpansion

echo.
echo ============================================
echo   GazeConnect Pro - Development Launcher
echo ============================================
echo.

REM ---- Parse arguments ----
set SIMULATE=0
set SKIP_BUILD=0

for %%a in (%*) do (
    if "%%a"=="--simulate" set SIMULATE=1
    if "%%a"=="-s" set SIMULATE=1
    if "%%a"=="--skip-build" set SKIP_BUILD=1
)

if !SIMULATE!==1 (
    echo   Mode: SIMULATION ^(mouse as gaze input^)
) else (
    echo   Mode: HARDWARE ^(Tobii Eye Tracker 5^)
)
echo.

REM ---- Cleanup old processes ----
echo [CLEANUP] Stopping any existing GazeConnect processes...

tasklist /FI "IMAGENAME eq electron.exe" 2>NUL | find /I /N "electron.exe" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /F /IM electron.exe >nul 2>&1
    echo   Stopped: Electron
)

tasklist /FI "IMAGENAME eq GazeConnect Pro.exe" 2>NUL | find /I /N "GazeConnect Pro.exe" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /F /IM "GazeConnect Pro.exe" >nul 2>&1
    echo   Stopped: GazeConnect Pro
)

tasklist /FI "IMAGENAME eq GazeConnectBackend.exe" 2>NUL | find /I /N "GazeConnectBackend.exe" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /F /IM GazeConnectBackend.exe >nul 2>&1
    echo   Stopped: GazeConnectBackend
)

tasklist /FI "WINDOWTITLE eq GazeConnect*" 2>NUL | find /I /N "GazeConnect" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /F /FI "WINDOWTITLE eq GazeConnect*" >nul 2>&1
    echo   Stopped: GazeConnect window
)

tasklist /FI "IMAGENAME eq TobiiGazeHelper.exe" 2>NUL | find /I /N "TobiiGazeHelper.exe" >NUL
if "%ERRORLEVEL%"=="0" (
    taskkill /F /IM TobiiGazeHelper.exe >nul 2>&1
    echo   Stopped: TobiiGazeHelper
)

REM ---- Check project ports only; do not kill unknown listeners ----
set PORT_BUSY=0
for %%p in (5173 5555 8765) do (
    for /f "tokens=5" %%q in ('netstat -ano ^| findstr ":%%p " ^| findstr "LISTENING" 2^>nul') do (
        echo   [WARN] Port %%p is still in use by PID %%q.
        set PORT_BUSY=1
    )
)
if "%PORT_BUSY%"=="1" (
    echo   You may need to stop the listed process(es) manually if startup fails.
)

echo   Done.
echo.

REM ---- Build TobiiGazeHelper (hardware mode only, Electron launches it) ----
if !SIMULATE!==0 (
    echo [1/2] Building TobiiGazeHelper...

    set HELPER_EXE=tobii-helper\TobiiGazeHelper\bin\Release\net6.0-windows\win-x64\TobiiGazeHelper.exe

    if !SKIP_BUILD!==0 (
        REM Build first
        where dotnet >nul 2>&1
        if errorlevel 1 (
            echo   [ERROR] .NET SDK not found! Cannot build TobiiGazeHelper.
            echo   Falling back to simulation mode.
            set SIMULATE=1
            goto :start_electron
        )

        if not exist "tobii-helper\TobiiGazeHelper\lib\Tobii.Interaction.Net.dll" (
            echo   [ERROR] Tobii DLLs not found in lib/ folder.
            echo   Run copy-tobii-dlls.bat first, or use --simulate mode.
            echo   Falling back to simulation mode.
            set SIMULATE=1
            goto :start_electron
        )

        dotnet build tobii-helper\TobiiGazeHelper\TobiiGazeHelper.csproj -c Release -r win-x64 --nologo -v q
        if !ERRORLEVEL! NEQ 0 (
            echo   [ERROR] Build failed! Falling back to simulation mode.
            set SIMULATE=1
            goto :start_electron
        )
        echo   Build OK.
    )

    if exist "!HELPER_EXE!" (
        echo   TobiiGazeHelper built. Electron will launch it automatically.
    ) else (
        echo   [WARN] TobiiGazeHelper.exe not found at: !HELPER_EXE!
        echo   Falling back to simulation mode.
        set SIMULATE=1
    )
) else (
    echo [1/2] Skipping TobiiGazeHelper ^(simulation mode^)
)

:start_electron
echo.
echo [2/2] Starting Electron + React + Python Backend...
echo.

if !SIMULATE!==1 (
    echo ============================================
    echo   SIMULATION MODE
    echo   Move your mouse to simulate eye gaze.
    echo   Python backend auto-started by Electron.
    echo ============================================
) else (
    echo ============================================
    echo   HARDWARE MODE
    echo   Python backend auto-started by Electron.
    echo   Do NOT start Python separately!
    echo ============================================
)
echo.

npm run dev:electron
