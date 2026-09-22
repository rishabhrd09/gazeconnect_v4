@echo off
REM Closes the GazeConnect development app started from this folder (any terminal).
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Stop-Dev.ps1"
exit /b %ERRORLEVEL%
