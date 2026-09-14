@echo off
setlocal
REM Process-scoped policy; no permanent execution-policy or administrator change.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Build-Installer.ps1" %*
exit /b %ERRORLEVEL%
