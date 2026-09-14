# Preserve the existing .bat flags as well as PowerShell -Simulate/-SkipBuild.
param([switch]$Simulate, [switch]$SkipBuild, [Parameter(ValueFromRemainingArguments=$true)][string[]]$LegacyArgs)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    foreach ($arg in $LegacyArgs) {
        switch ($arg) {
            '--simulate' { $Simulate = $true }
            '-s' { $Simulate = $true }
            '--skip-build' { $SkipBuild = $true }
            default { throw "Unknown argument: $arg" }
        }
    }
    Assert-Windows
    Set-Location -LiteralPath $ProjectRoot
    Require-Command 'npm.cmd'
    Require-File $VenvPython
    Require-File (Join-Path $ProjectRoot 'node_modules\.bin\electron.cmd')
    $ports = @(5173, 8765, 5050)
    if (-not $Simulate) { $ports += 5555 }
    Assert-FreePorts $ports
    if (-not $Simulate) {
        Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'source', '--root', $ProjectRoot)
        if (-not $SkipBuild) {
            Assert-BuildTools
            Invoke-Checked 'dotnet.exe' @('build', $TobiiProject, '-c', 'Release', '-r', 'win-x64', '--nologo')
        }
        Require-File (Join-Path $ProjectRoot 'tobii-helper\TobiiGazeHelper\bin\Release\net8.0-windows\win-x64\TobiiGazeHelper.exe')
    }
    $env:GAZE_SIMULATE = if ($Simulate) { '1' } else { '0' }
    if (-not $env:GAZE_DEBUG) { $env:GAZE_DEBUG = '0' }
    # Files are per launch. Continuous gaze output never floods a terminal.
    $logDir = Join-Path $ProjectRoot 'tools\reports'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logPath = Join-Path $logDir ('dev-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    Write-Host "Starting application. Logs: $logPath"
    & npm.cmd run dev:electron *> $logPath
    if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $logPath -Tail 40; throw "Development launch failed; see $logPath" }
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
