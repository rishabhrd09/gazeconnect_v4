@echo off
REM ============================================================
REM  GazeConnect Pro - OPTIONAL Local LLM setup (Phase 0)
REM ============================================================
REM  Run this ONCE, and ONLY IF you want to try the smarter
REM  local-LLM word/phrase prediction. It is completely optional.
REM
REM  SAFETY: everything installs into the project's OWN Python venv
REM  (python\.venv) and downloads models into the project folder
REM  (python\ml\trained_models). It NEVER touches Windows system
REM  files, the registry, or anything outside this project. To undo,
REM  just delete the model folder and pip-uninstall (shown at the end).
REM
REM  The normal app does NOT need this. Without it, prediction works
REM  exactly as before (n-gram + the small 1.9 MB LSTM). This script
REM  does NOT run automatically from setup.bat or start-dev.bat.
REM ============================================================

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   GazeConnect Pro - Optional Local LLM setup (Phase 0)
echo ============================================================
echo.

REM ---- venv must exist (created by setup.bat) ----
if not exist "python\.venv\Scripts\python.exe" (
    echo   [ABORT] Python venv not found. Run setup.bat FIRST, then this script.
    echo.
    pause
    exit /b 1
)
set PY=python\.venv\Scripts\python.exe

REM ---- show disk headroom so you know what you are committing to ----
echo [INFO] Free disk space on this drive:
for /f "tokens=3" %%a in ('dir /-c "%~d0\" ^| find "bytes free"') do echo         %%a bytes free
echo.
echo   This will add, into the project only:
echo     - onnxruntime-genai runtime               (~tens of MB, KEPT)
echo     - build tools (torch, transformers, onnx)  (~1-2 GB, ONE-TIME - this
echo       script AUTO-REMOVES them again right after building)
echo     - ONE small quantized model (SmolLM2-360M) (~250-350 MB, KEPT)
echo   Net PERMANENT footprint after the auto-cleanup: about 300-400 MB.
echo   Peak during build needs ~2-3 GB free temporarily.
echo.
set /p GO="Proceed? [Y/N] "
if /i not "!GO!"=="Y" (
    echo   Cancelled. Nothing was installed or downloaded.
    pause
    exit /b 0
)
echo.

REM ---- Step 1: inference runtime (idempotent) ----
echo ============================================================
echo [1/4] Installing onnxruntime-genai (local inference runtime)...
echo ============================================================
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

REM ---- Step 2: choose + build a model (idempotent) ----
REM  Default = SmolLM2-360M-Instruct: smallest good option (~250-350 MB final).
REM  For a bit more quality (bigger build), swap MODEL_ID to
REM  Qwen/Qwen2.5-0.5B-Instruct and OUT to ...\qwen2.5-0.5b-onnx (also update the
REM  benchmark path a few lines below to match).
set MODEL_ID=HuggingFaceTB/SmolLM2-360M-Instruct
set OUT=python\ml\trained_models\smollm2-360m-onnx

echo ============================================================
echo [2/4] Preparing model: %MODEL_ID%
echo ============================================================
if exist "%OUT%\genai_config.json" (
    echo   [OK] Model already built at %OUT% - skipping download/build.
    goto :benchmark
)

echo   Installing one-time build tools (torch cpu + transformers + onnx)...
%PY% -m pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet
%PY% -m pip install transformers onnx --quiet
if errorlevel 1 (
    echo   [WARN] Could not install build tools. The app still works without the LLM.
    pause
    exit /b 1
)
echo   Building int4 CPU model (downloads the base model + converts; can take a while)...
%PY% -m onnxruntime_genai.models.builder -m %MODEL_ID% -o "%OUT%" -p int4 -e cpu -c "python\.hf_cache"
if errorlevel 1 (
    echo   [WARN] Model build failed. The app still works without the LLM.
    echo          You can retry, or download a pre-built ONNX-GenAI model into %OUT%.
    pause
    exit /b 1
)
echo   [OK] Model built at %OUT%
echo.

REM ---- Auto-reclaim: remove the one-time build tools + source cache (~1-2 GB) ----
echo   Reclaiming space: removing one-time build tools + source cache...
%PY% -m pip uninstall -y torch transformers >nul 2>&1
if exist "python\.hf_cache" rmdir /s /q "python\.hf_cache" >nul 2>&1
echo   [OK] Reclaimed. Kept only: onnxruntime-genai runtime + the int4 model.
echo.

:benchmark
REM ---- Step 3: benchmark on THIS machine ----
echo ============================================================
echo [3/4] Benchmarking on this machine (latency, RAM, quality)...
echo ============================================================
pushd python
..\%PY% -m ml.llm_benchmark --models "ml\trained_models\smollm2-360m-onnx"
popd
echo.

REM ---- Step 4: report footprint + how to remove ----
echo ============================================================
echo [4/4] Done. Permanent footprint + how to undo:
echo ============================================================
echo   Kept on disk: onnxruntime-genai runtime (~tens of MB) + the model:
for /f "tokens=3" %%a in ('dir /s /-c "%OUT%" ^| find "File(s)"') do echo         %OUT%  =  %%a bytes
echo.
echo   To REMOVE the LLM completely later (fully reversible, safe):
echo     rmdir /s /q "%OUT%"
echo     %PY% -m pip uninstall -y onnxruntime-genai onnx
echo.
echo   The LLM stays OFF until it is wired in (Phase 1) behind a default-OFF flag.
echo   The normal app is unaffected either way.
echo.
pause
