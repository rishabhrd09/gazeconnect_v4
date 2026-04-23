@echo off
echo ============================================
echo   GazeConnect Pro - Cleanup Script
echo ============================================
echo.

echo Cleaning node_modules...
if exist node_modules rmdir /s /q node_modules

echo Cleaning python venv...
if exist python\.venv rmdir /s /q python\.venv

echo Cleaning dist folders...
if exist dist rmdir /s /q dist
if exist release rmdir /s /q release
if exist python-dist rmdir /s /q python-dist
if exist tobii-dist rmdir /s /q tobii-dist
if exist dist-electron rmdir /s /q dist-electron

echo.
echo Cleanup Complete. You can now run setup.bat.
pause
