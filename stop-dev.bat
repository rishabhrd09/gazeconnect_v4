@echo off
REM Closes the GazeConnect development app started from this folder (any terminal).
REM --force also stops a program outside this checkout that holds port 8765 or 5555.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Stop-Dev.ps1" %*
exit /b %ERRORLEVEL%
