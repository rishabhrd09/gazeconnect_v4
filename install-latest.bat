@echo off
setlocal
REM Installs the newest build in release\ after checking it against the build's own record
REM (scripts\windows\Install-Latest.ps1). --check only checks. Process-scoped policy; no permanent
REM execution-policy or administrator change.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Install-Latest.ps1" %*
set "INSTALL_EXIT=%ERRORLEVEL%"
REM Opened by a double-click the window closes at the end: keep it until a key is pressed (not for --check).
if /i not "%~1"=="--check" pause
exit /b %INSTALL_EXIT%
