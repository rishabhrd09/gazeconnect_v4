@echo off
REM ============================================================
REM  GazeConnect Pro - Retrain the tiny word model (Track 1)
REM ============================================================
REM  Upgrades the SHIPPED word-prediction model in place. It blends a
REM  small slice of REAL everyday English (Tatoeba, public, human-written)
REM  with the app's curated AAC corpus, retrains the tiny CIFG-LSTM, and
REM  drops the new int8 model in as gazeconnect_lm_quantized.onnx.
REM
REM  WHAT SHIPS AFTERWARDS STAYS TINY: the model is still ~2-3 MB and runs
REM  on the onnxruntime we already ship (NO torch, NO genai at run time,
REM  ~tens of MB RAM). Only this developer machine temporarily grows.
REM
REM  SAFETY:
REM   - Everything installs into the project's OWN venv (python\.venv).
REM   - The current model is BACKED UP first (fully reversible).
REM   - The one-time build tools (torch + onnx, ~1-2 GB) are AUTO-REMOVED
REM     at the end to reclaim space.
REM   - It NEVER touches Windows system files or anything outside this project.
REM   - Opt-in only: NOT called by setup.bat or start-dev.bat.
REM ============================================================

setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ---- Tunables (edit if you want a bigger corpus / longer training) ----
set EPOCHS=20
set MAXSENT=45000
set MINFREQ=2

echo.
echo ============================================================
echo   GazeConnect Pro - Retrain word model (real-corpus upgrade)
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

REM ---- show disk headroom + the deal ----
echo [INFO] Free disk space on this drive:
for /f "tokens=3" %%a in ('dir /-c "%~d0\" ^| find "bytes free"') do echo         %%a bytes free
echo.
echo   This will, into the project only:
echo     - download a small real-English corpus  (~30-40 MB, then filtered
echo       down to a few MB text file, dev-side only)
echo     - install build tools torch + onnx       (~1-2 GB, ONE-TIME - this
echo       script AUTO-REMOVES them again after training)
echo     - retrain + int8-quantize the model      (final model ~2-3 MB, KEPT)
echo   Net PERMANENT footprint change: about +1-2 MB (a slightly bigger model).
echo   Peak disk during training needs ~2-3 GB free temporarily.
echo   Training on CPU can take 30-90 min. Your current model is backed up first.
echo.
set /p GO="Proceed? [Y/N] "
if /i not "!GO!"=="Y" (
    echo   Cancelled. Nothing was changed, installed, or downloaded.
    pause
    exit /b 0
)
echo.

REM ============================================================
echo [1/6] Fetching a small REAL English corpus (Tatoeba)...
echo ============================================================
pushd python
..\%PY% -m ml.training_data.fetch_external_corpus --max %MAXSENT%
set FETCHERR=%errorlevel%
popd
if not "%FETCHERR%"=="0" (
    echo   [ABORT] Corpus fetch failed - nothing was changed.
    echo           If the network is blocked, download the Tatoeba English
    echo           export manually and run, from the python folder:
    echo             ..\%PY% -m ml.training_data.fetch_external_corpus --input ^<file.tsv.bz2^>
    echo           then re-run this script.
    pause
    exit /b 1
)
echo   [OK] external_corpus.txt ready.
echo.

REM ============================================================
echo [2/6] Backing up the current model (reversible)...
echo ============================================================
set MODELDIR=python\ml\trained_models
set BACKUP=%MODELDIR%\backup_pre_retrain
if not exist "%BACKUP%" mkdir "%BACKUP%"
for %%F in (gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json) do (
    if exist "%MODELDIR%\%%F" copy /y "%MODELDIR%\%%F" "%BACKUP%\%%F" >nul
)
echo   [OK] Backed up to %BACKUP%
echo.

REM ============================================================
echo [3/6] Installing one-time build tools (torch cpu + onnx)...
echo ============================================================
%PY% -c "import torch" >nul 2>&1
if errorlevel 1 (
    %PY% -m pip install torch --index-url https://download.pytorch.org/whl/cpu --quiet
    if errorlevel 1 (
        echo   [FAIL] Could not install torch. Nothing was changed to the live model.
        echo          Your backup is safe in %BACKUP%.
        pause
        exit /b 1
    )
)
%PY% -m pip install onnx --quiet
echo   [OK] Build tools ready.
echo.

REM ============================================================
echo [4/6] Retraining + int8 quantizing (this is the long part)...
echo ============================================================
pushd python
..\%PY% -m ml.train --epochs %EPOCHS% --min-freq %MINFREQ%
set TRAINERR=%errorlevel%
popd
if not "%TRAINERR%"=="0" (
    echo   [FAIL] Training failed. Restoring the backed-up model...
    for %%F in (gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json) do (
        if exist "%BACKUP%\%%F" copy /y "%BACKUP%\%%F" "%MODELDIR%\%%F" >nul
    )
    echo   [OK] Original model restored. Removing build tools...
    %PY% -m pip uninstall -y torch onnx >nul 2>&1
    pause
    exit /b 1
)
echo   [OK] New model trained + quantized.
echo.

REM ============================================================
echo [5/6] Verifying the new model (size + loads + predicts)...
echo ============================================================
pushd python
..\%PY% -m ml.verify_model
set VERIFYERR=%errorlevel%
popd
if not "%VERIFYERR%"=="0" (
    echo.
    echo   [WARN] Verification failed. Restoring the backed-up model to be safe...
    for %%F in (gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json) do (
        if exist "%BACKUP%\%%F" copy /y "%BACKUP%\%%F" "%MODELDIR%\%%F" >nul
    )
    echo   [OK] Original model restored. Build tools will still be removed below.
)
echo.

REM ============================================================
echo [6/6] Reclaiming space (build tools + dev-only artifacts)...
echo ============================================================
%PY% -m pip uninstall -y torch onnx >nul 2>&1
REM  Dev-only training outputs the RUNTIME never loads (it uses the quantized
REM  model). Removing them keeps the shipped folder as lean as it is today.
if exist "%MODELDIR%\gazeconnect_lm.onnx" del /q "%MODELDIR%\gazeconnect_lm.onnx"
if exist "%MODELDIR%\gazeconnect_lm.pt" del /q "%MODELDIR%\gazeconnect_lm.pt"
if exist "python\ml\training_data\external_corpus.txt" del /q "python\ml\training_data\external_corpus.txt"
echo   [OK] Removed torch + onnx + dev-only artifacts.
echo        Kept: onnxruntime + the new quantized model + vocabulary.
echo.
echo ============================================================
echo   Done.
echo ============================================================
echo   New model: %MODELDIR%\gazeconnect_lm_quantized.onnx
for %%F in ("%MODELDIR%\gazeconnect_lm_quantized.onnx") do echo   Size: %%~zF bytes
echo.
echo   The app uses it automatically on next start - no code change, and the
echo   gaze pipeline is unaffected (same runtime, same 30 ms neural timeout).
echo.
echo   To A/B compare or measure the win: start the app, open the keyboard,
echo   type realistic English + Hinglish, and watch the top-4 accept-rate and
echo   chars-saved in predictionTelemetry.
echo.
echo   To REVERT to the previous model (fully reversible):
echo     copy /y "%BACKUP%\*" "%MODELDIR%\"
echo.
pause
