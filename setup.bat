@echo off
REM ============================================
REM GazeConnect Pro - First Time Setup
REM ============================================
REM Run this ONCE after cloning or extracting the project.
REM
REM Prerequisites (install manually first):
REM   - Node.js 18+       https://nodejs.org
REM   - Python 3.10+      https://python.org
REM   - .NET 6.0 SDK      https://dotnet.microsoft.com/download/dotnet/6.0
REM   - Tobii Experience   https://gaming.tobii.com/getstarted
REM ============================================

setlocal EnableDelayedExpansion

echo.
echo ============================================
echo   GazeConnect Pro - First Time Setup
echo ============================================
echo.

set ERRORS=0
set WARNINGS=0

REM ---- Check prerequisites ----
echo [CHECK] Verifying prerequisites...
echo.

REM -- Node.js --
where node >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] Node.js not found!
    echo          Install from: https://nodejs.org ^(v18+^)
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%v in ('node --version') do echo   [OK] Node.js %%v
)

REM -- npm --
where npm >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] npm not found! Should come with Node.js.
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%v in ('npm --version') do echo   [OK] npm %%v
)

REM -- Python --
where python >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] Python not found!
    echo          Install from: https://python.org ^(v3.10+^)
    echo          IMPORTANT: Check "Add Python to PATH" during install.
    set /a ERRORS+=1
) else (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo   [OK] %%v
)

REM -- .NET SDK --
where dotnet >nul 2>&1
if errorlevel 1 (
    echo   [WARN] .NET SDK not found. TobiiGazeHelper won't build.
    echo          Install: https://dotnet.microsoft.com/download/dotnet/6.0
    echo          ^(Only needed for eye tracker hardware support^)
    set /a WARNINGS+=1
) else (
    for /f "tokens=*" %%v in ('dotnet --version 2^>^&1') do echo   [OK] .NET SDK %%v
)

echo.

REM -- Stop if critical errors --
if !ERRORS! GTR 0 (
    echo [ABORT] !ERRORS! critical prerequisite^(s^) missing. Please install them first.
    echo.
    pause
    exit /b 1
)

if !WARNINGS! GTR 0 (
    echo [INFO] !WARNINGS! warning^(s^) above. Continuing setup...
    echo.
)

REM ---- Step 1: Node.js packages ----
echo ============================================
echo [1/4] Installing Node.js packages...
echo ============================================
call npm install
if errorlevel 1 (
    echo   [FAIL] npm install failed! Check errors above.
    pause
    exit /b 1
)
echo   Done.
echo.

REM ---- Step 2: Python virtual env + packages ----
echo ============================================
echo [2/4] Setting up Python environment...
echo       ^(core backend + floor plan dependencies^)
echo ============================================
if not exist "python\.venv" (
    echo   Creating virtual environment...
    python -m venv python\.venv
    if errorlevel 1 (
        echo   [FAIL] Could not create Python virtual environment!
        pause
        exit /b 1
    )
)

echo   Activating venv and installing packages...
call python\.venv\Scripts\activate.bat
if exist "requirements.txt" (
    pip install -r requirements.txt --quiet
) else (
    pip install -r python\requirements.txt --quiet
)
if errorlevel 1 (
    echo   [FAIL] Python package installation failed!
    pause
    exit /b 1
)
echo   Verifying floor plan modules...
python -c "import flask, flask_cors, cairo, ezdxf, PIL, numpy, svgwrite, shapely, networkx, squarify; from ortools.sat.python import cp_model" >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] One or more floor plan dependencies (v4/v5) are missing after install.
    echo          Please re-run setup or check pip output for errors.
    pause
    exit /b 1
)

echo.
echo   Installing GazeConnect Neural Language Model dependencies...
echo   (onnxruntime ~33 MB - for AI word prediction)
pip install onnxruntime --quiet
if errorlevel 1 (
    echo   [WARN] onnxruntime install failed. Neural predictions will be disabled.
    echo          App will still work with n-gram predictions only.
    set /a WARNINGS+=1
) else (
    echo   [OK] onnxruntime installed - Neural LM ready
)

echo   Verifying neural model files...
if exist "python\ml\trained_models\gazeconnect_lm_quantized.onnx" (
    echo   [OK] Neural model found (gazeconnect_lm_quantized.onnx, ~1.9 MB)
) else (
    echo   [WARN] Neural model not found in python\ml\trained_models\
    echo          Neural predictions disabled until model is trained.
    echo          To train: cd python ^&^& python -m ml.train
    set /a WARNINGS+=1
)

call deactivate
echo   Done.
echo.

REM ---- Step 3: Verify Tobii DLLs ----
echo ============================================
echo [3/4] Verifying Tobii DLLs...
echo ============================================

set LIB_DIR=tobii-helper\TobiiGazeHelper\lib
set DLL_OK=1

if not exist "%LIB_DIR%\Tobii.Interaction.Net.dll" set DLL_OK=0
if not exist "%LIB_DIR%\Tobii.Interaction.Model.dll" set DLL_OK=0
if not exist "%LIB_DIR%\Tobii.EyeX.Client.dll" set DLL_OK=0

if !DLL_OK!==1 (
    echo   [OK] Tobii DLLs found in %LIB_DIR%
) else (
    echo   [WARN] Some Tobii DLLs are missing from %LIB_DIR%
    echo.
    echo   Attempting to copy from system install...
    set TOBII_SRC=C:\Program Files\Tobii\Tobii EyeX
    if exist "!TOBII_SRC!" (
        if not exist "%LIB_DIR%" mkdir "%LIB_DIR%"
        for %%f in (
            Tobii.Interaction.Net.dll
            Tobii.Interaction.Model.dll
            Tobii.EyeX.Client.dll
            Tobii.EyeX.Common.dll
            tobii_stream_engine.dll
            Tobii.Tech.NETCommon.ClrExtensions.dll
        ) do (
            if exist "!TOBII_SRC!\%%f" (
                copy /Y "!TOBII_SRC!\%%f" "%LIB_DIR%\%%f" >nul 2>&1
                echo     Copied: %%f
            )
        )
        echo   Done.
    ) else (
        echo   [INFO] Tobii Experience not found on this machine.
        echo          If you have an eye tracker, install Tobii Experience:
        echo            https://gaming.tobii.com/getstarted
        echo          Then run: copy-tobii-dlls.bat
        echo          The app will still work in simulation mode ^(mouse-as-gaze^).
    )
)
echo.

REM ---- Step 4: Build TobiiGazeHelper (.NET) ----
echo ============================================
echo [4/4] Building TobiiGazeHelper...
echo ============================================
set TOBII_PROJ=tobii-helper\TobiiGazeHelper\TobiiGazeHelper.csproj

where dotnet >nul 2>&1
if errorlevel 1 (
    echo   [SKIP] .NET SDK not installed. Skipping TobiiGazeHelper build.
    echo          Eye tracker support requires .NET 6.0 SDK.
) else (
    if not exist "%LIB_DIR%\Tobii.Interaction.Net.dll" (
        echo   [SKIP] Tobii DLLs not available. Skipping build.
        echo          App will work in simulation mode.
    ) else (
        if exist "%TOBII_PROJ%" (
            pushd tobii-helper\TobiiGazeHelper
            dotnet build -c Release
            if errorlevel 1 (
                echo   [WARN] .NET build failed. Eye tracker may not work.
                echo          App will still work in simulation mode.
            ) else (
                echo   [OK] TobiiGazeHelper built successfully.
            )
            popd
        ) else (
            echo   [WARN] TobiiGazeHelper project not found.
        )
    )
)

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo   To start the app:
echo     .\start-dev.bat            (with eye tracker)
echo     .\start-dev.bat --simulate (mouse as gaze)
echo.
echo   To build installer:
echo     .\build-installer.bat
echo.
echo   Make sure (for eye tracker mode):
echo     1. Tobii Eye Tracker 5 is connected via USB
echo     2. Tobii Experience is installed and calibrated
echo     3. Tobii gaze/mouse control is enabled
echo.
pause
