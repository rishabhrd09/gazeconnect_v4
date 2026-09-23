@echo off
REM Shows what is running from this folder and which ports a launch needs. Changes nothing.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Status-Dev.ps1"
exit /b %ERRORLEVEL%
