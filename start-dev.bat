@echo off
setlocal
REM Translate the established flags explicitly for Windows PowerShell 5.1.
set "DEV_ARGS="
:parse
if "%~1"=="" goto run
if /I "%~1"=="--simulate" goto simulate
if /I "%~1"=="-s" goto simulate
if /I "%~1"=="-Simulate" goto simulate
if /I "%~1"=="--skip-build" goto skip_build
if /I "%~1"=="-SkipBuild" goto skip_build
if /I "%~1"=="--quiet" goto quiet
if /I "%~1"=="-q" goto quiet
if /I "%~1"=="-Quiet" goto quiet
echo Unknown argument. Use --simulate, --skip-build and/or --quiet.
exit /b 1
:simulate
set "DEV_ARGS=%DEV_ARGS% -Simulate"
shift
goto parse
:skip_build
set "DEV_ARGS=%DEV_ARGS% -SkipBuild"
shift
goto parse
:quiet
set "DEV_ARGS=%DEV_ARGS% -Quiet"
shift
goto parse
:run
REM Process-scoped policy only; no elevation or permanent policy change.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Start-Dev.ps1" %DEV_ARGS%
exit /b %ERRORLEVEL%
