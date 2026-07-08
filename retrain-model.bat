@echo off
REM ============================================================
REM  GazeConnect Pro - Retrain the tiny word model (Track 1)
REM ============================================================
REM  Upgrades the SHIPPED word-prediction model in place.
REM  Blends a small slice of REAL everyday English (Tatoeba) with
REM  curated AAC corpus, retrains the tiny CIFG-LSTM, then updates:
REM  gazeconnect_lm_quantized.onnx.
REM ============================================================

setlocal EnableDelayedExpansion
cd /d "%~dp0"

set EPOCHS=20
set MAXSENT=45000
set MINFREQ=2

echo.
echo ============================================================
echo   GazeConnect Pro - Retrain word model (real-corpus upgrade)
echo ============================================================
echo.

if not exist "python\.venv\Scripts\python.exe" (
    echo   [ABORT] Python venv not found. Run setup.bat FIRST, then this script.
    echo.
    pause
    exit /b 1
)
set PY=python\.venv\Scripts\python.exe

echo [INFO] Free disk space on this drive:
for /f "tokens=3" %%a in ('dir /-c "%~d0\" ^| find "bytes free"') do echo         %%a bytes free
echo.
echo   This will, into the project only:
echo     - download a small real-English corpus  (~30-40 MB, then filtered)
echo     - install build tools torch + onnx       (~1-2 GB, ONE-TIME - auto-removal)
echo     - retrain + int8-quantize the model      (final model ~2-3 MB, KEPT)
echo.
set /p GO="Proceed? [Y/N] "
if /i not "!GO!"=="Y" (
    echo   Cancelled. Nothing was changed.
    pause
    exit /b 0
)

set MODELDIR=python\ml\trained_models
set BACKUP=%MODELDIR%\backup_pre_retrain
if not exist "%BACKUP%" mkdir "%BACKUP%"
set BUILD_TOOLS_INSTALLED=0
set HF_CACHE=python\.hf_cache

call :backup_model

echo ============================================================
echo [1/6] Fetching a small REAL English corpus (Tatoeba)...
echo ============================================================
pushd python
..\%PY% -m ml.training_data.fetch_external_corpus --max %MAXSENT%
set FETCHERR=%errorlevel%
popd
if not "%FETCHERR%"=="0" (
    echo   [ABORT] Corpus fetch failed. Nothing was changed to the live model.
    echo           If network is blocked, pass a local file via --input.
    pause
    exit /b 1
)
echo   [OK] external_corpus.txt ready.

echo ============================================================
echo [2/6] Backing up the current model (reversible)...
echo ============================================================
echo   [OK] Backed up to %BACKUP%

echo ============================================================
echo [3/6] Installing one-time build tools (torch + onnx)...
echo ============================================================
%PY% -m pip install --quiet numpy onnxruntime
if errorlevel 1 (
  echo   [ABORT] Could not install numpy/onnxruntime.
  pause
  exit /b 1
)
%PY% -c "import torch" >nul 2>&1
if errorlevel 1 (
  set BUILD_TOOLS_INSTALLED=1
  %PY% -m pip install --quiet torch
  if errorlevel 1 (
    echo   [ABORT] Could not install torch.
    call :cleanup_exit
    exit /b 1
  )
) else (
  echo   [OK] torch already present.
)
%PY% -c "import onnx" >nul 2>&1
if errorlevel 1 (
  set BUILD_TOOLS_INSTALLED=1
  %PY% -m pip install --quiet onnx
  if errorlevel 1 (
    echo   [ABORT] Could not install onnx.
    call :cleanup_exit
    exit /b 1
  )
) else (
echo   [OK] onnx already present.
)

echo ============================================================
echo [4/6] Retraining + int8 quantizing (the long part)...
echo ============================================================
pushd python
..\%PY% -m ml.train --epochs %EPOCHS% --min-freq %MINFREQ%
set TRAINERR=%errorlevel%
popd
if not "%TRAINERR%"=="0" (
  echo   [FAIL] Training failed. Restoring the backed-up model...
  call :restore_model
  call :cleanup_exit
  pause
  exit /b 1
)

echo ============================================================
echo [5/6] Verifying the new model (size + loads + predicts)...
echo ============================================================
pushd python
..\%PY% -m ml.verify_model
set VERIFYERR=%errorlevel%
popd
if not "%VERIFYERR%"=="0" (
  echo   [WARN] Verification failed. Restoring the backed-up model...
  call :restore_model
)

echo ============================================================
echo [6/6] Reclaiming space (build tools + dev-only artifacts)...
echo ============================================================
call :cleanup_exit
if exist "%MODELDIR%\gazeconnect_lm.onnx" del /q "%MODELDIR%\gazeconnect_lm.onnx"
if exist "%MODELDIR%\gazeconnect_lm.pt" del /q "%MODELDIR%\gazeconnect_lm.pt"
if exist "python\ml\training_data\external_corpus.txt" del /q "python\ml\training_data\external_corpus.txt"
echo   [OK] Removed torch + onnx + dev-only artifacts.
echo.
echo   New model:
if exist "%MODELDIR%\gazeconnect_lm_quantized.onnx" for %%F in ("%MODELDIR%\gazeconnect_lm_quantized.onnx") do echo       %%~zF bytes
echo.
pause
exit /b 0

:backup_model
for %%F in (gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json) do (
    if exist "%MODELDIR%\%%F" copy /y "%MODELDIR%\%%F" "%BACKUP%\%%F" >nul
)
goto :eof

:restore_model
for %%F in (gazeconnect_lm_quantized.onnx gazeconnect_lm.onnx vocabulary.json training_log.json) do (
    if exist "%BACKUP%\%%F" copy /y "%BACKUP%\%%F" "%MODELDIR%\%%F" >nul
)
goto :eof

:cleanup_exit
if "%BUILD_TOOLS_INSTALLED%"=="1" (
  %PY% -m pip uninstall -y torch onnx >nul 2>&1
  set BUILD_TOOLS_INSTALLED=0
)
goto :eof
