@echo off
setlocal
REM Finite readiness checks. No gaze stream, driver changes, or background servers.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Test-Environment.ps1" %*
exit /b %ERRORLEVEL%
