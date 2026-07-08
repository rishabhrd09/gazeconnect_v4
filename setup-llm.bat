@echo off
REM ============================================================
REM  GazeConnect Pro - OPTIONAL Local LLM setup (Phase 0)
REM ============================================================
REM  Run this ONCE, and ONLY IF you want to try the smarter
REM  local-LLM word/phrase prediction. It is completely optional.
REM
REM  SAFETY: everything installs into the project's OWN Python venv
REM  (python\.venv) and downloads models into the project folder
REM  (python\ml\trained_models). It never touches system files.
REM  The normal app does NOT need this. Without it, prediction works
REM  exactly as before (n-gram + the small 1.9 MB LSTM).
REM ============================================================

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   GazeConnect Pro - Optional Local LLM setup (Phase 0)
echo ============================================================
echo.

if not exist "python\.venv\Scripts\python.exe" (
    echo   [ABORT] Python venv not found. Run setup.bat FIRST, then this script.
    echo.
    pause
    exit /b 1
)
set PY=python\.venv\Scripts\python.exe
set HF_HOME_DIR=python\.hf_cache
set CACHE_DIR=python\.cache

set BUILD_TOOLS_INSTALLED=0
if not exist "%HF_HOME_DIR%" mkdir "%HF_HOME_DIR%"
if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"
set PYTHONNOUSERSITE=1
set PIP_DISABLE_PIP_VERSION_CHECK=1
set PIP_NO_CACHE_DIR=1
set HF_HOME=%HF_HOME_DIR%
set PIP_CACHE_DIR=%CACHE_DIR%\pip

goto :main

:cleanup_build_tools
if "%BUILD_TOOLS_INSTALLED%"=="1" (
  %PY% -m pip uninstall -y torch transformers onnx >nul 2>&1
  set BUILD_TOOLS_INSTALLED=0
)
if exist "%HF_HOME_DIR%" rmdir /s /q "%HF_HOME_DIR%" >nul 2>&1
goto :eof

:error_exit
call :cleanup_build_tools
echo   [WARN] Setup partially completed and cleaned up build tooling.
echo   The app remains functional with defaults.
pause
exit /b 1

:main
echo [INFO] Free disk space on this drive:
for /f "tokens=3" %%a in ('dir /-c "%~d0\" ^| find "bytes free"') do echo         %%a bytes free
echo.
echo   This adds, into the project only:
echo     - onnxruntime-genai runtime               (~tens of MB, KEPT)
echo     - build tools (torch, transformers, onnx)  (~1-2 GB, ONE-TIME)
echo     - ONE small quantized model (SmolLM2-360M) (~250-350 MB, KEPT)
echo   Net PERMANENT footprint after cleanup: about 300-400 MB.
echo.
set /p GO="Proceed? [Y/N] "
if /i not "!GO!"=="Y" (
    echo   Cancelled. Nothing was installed or downloaded.
    pause
    exit /b 0
)
echo.

echo [1/4] Installing onnxruntime-genai (local inference runtime)...
%PY% -c "import onnxruntime_genai" >nul 2>&1
if errorlevel 1 (
    %PY% -m pip install onnxruntime-genai psutil --quiet
    if errorlevel 1 (
        echo   [FAIL] Could not install onnxruntime-genai. Aborting - app is unaffected.
        pause
        exit /b 1
    )
    echo   [OK] onnxruntime-genai installed.
) else (
    echo   [OK] onnxruntime-genai already present - skipping.
)
echo.

set MODEL_ID=HuggingFaceTB/SmolLM2-360M-Instruct
set OUT=python\ml\trained_models\smollm2-360m-onnx
echo [2/4] Preparing model: %MODEL_ID%
if exist "%OUT%\genai_config.json" (
    echo   [OK] Model already built at %OUT% - skipping.
    goto :benchmark
)

echo   Installing one-time build tools (torch cpu + transformers + onnx)...
set BUILD_TOOLS_INSTALLED=1
%PY% -m pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet
if errorlevel 1 (
    echo   [WARN] Could not install build tools. App still works without the LLM.
    call :error_exit
)
%PY% -m pip install transformers onnx --quiet
if errorlevel 1 (
    echo   [WARN] Could not install build tools. App still works without the LLM.
    call :error_exit
)

echo   Building int4 CPU model (downloads base model + converts; can take a while)...
%PY% -m onnxruntime_genai.models.builder -m %MODEL_ID% -o "%OUT%" -p int4 -e cpu -c "%HF_HOME_DIR%"
if errorlevel 1 (
    echo   [WARN] Model build failed. The app still works without the LLM.
    call :error_exit
)
echo   [OK] Model built at %OUT%
set BUILD_TOOLS_INSTALLED=0
call :cleanup_build_tools
echo   [OK] Reclaimed. Kept only: onnxruntime-genai runtime + the int4 model.

:benchmark
echo [3/4] Benchmarking on this machine (latency, RAM, quality)...
cd /d "%~dp0"
cd python
%PY% -m ml.llm_benchmark --models "ml\trained_models\smollm2-360m-onnx"
cd /d "%~dp0"
echo.

echo [4/4] Done. To REMOVE the LLM later (fully reversible):
echo   rmdir /s /q "%OUT%"
echo   %PY% -m pip uninstall -y onnxruntime-genai onnx
echo.
echo   The LLM stays OFF until it is wired in (Phase 1) behind a default-OFF flag.
echo.
pause
exit /b 0
