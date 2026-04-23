@echo off
REM ============================================
REM Copy Tobii DLLs to Local lib/ Folder
REM ============================================
REM Run this if you need to update the bundled Tobii DLLs.
REM The DLLs are already included in the repository — this
REM script is only needed if you're setting up from scratch
REM or updating to a newer Tobii version.
REM ============================================

setlocal

set TOBII_SRC=C:\Program Files\Tobii\Tobii EyeX
set LIB_DIR=%~dp0tobii-helper\TobiiGazeHelper\lib

echo.
echo ============================================
echo   Tobii DLL Copy Utility
echo ============================================
echo.

if not exist "%TOBII_SRC%" (
    echo [ERROR] Tobii EyeX not found at: %TOBII_SRC%
    echo.
    echo Please install Tobii Experience first:
    echo   https://gaming.tobii.com/getstarted
    echo.
    echo Or if installed elsewhere, edit TOBII_SRC in this script.
    pause
    exit /b 1
)

if not exist "%LIB_DIR%" mkdir "%LIB_DIR%"

echo Copying DLLs from: %TOBII_SRC%
echo                 To: %LIB_DIR%
echo.

set COPIED=0
for %%f in (
    Tobii.Interaction.Net.dll
    Tobii.Interaction.Model.dll
    Tobii.EyeX.Client.dll
    Tobii.EyeX.Common.dll
    tobii_stream_engine.dll
    Tobii.Tech.NETCommon.ClrExtensions.dll
) do (
    if exist "%TOBII_SRC%\%%f" (
        copy /Y "%TOBII_SRC%\%%f" "%LIB_DIR%\%%f" >nul
        echo   [OK] %%f
        set /a COPIED+=1
    ) else (
        echo   [SKIP] %%f not found
    )
)

echo.
echo Copied %COPIED% DLL files.
echo.
echo You can now build TobiiGazeHelper:
echo   cd tobii-helper\TobiiGazeHelper
echo   dotnet build -c Release
echo.
pause
