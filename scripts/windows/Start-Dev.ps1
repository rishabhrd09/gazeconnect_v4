# Preserve the existing .bat flags as well as PowerShell -Simulate/-SkipBuild/-Quiet.
# Default: application output streams in this window AND into a per-launch log file; Ctrl+C here
# closes the whole app. -Quiet (--quiet) writes the file only, for unattended or agent-driven runs.
param([switch]$Simulate, [switch]$SkipBuild, [switch]$Quiet, [Parameter(ValueFromRemainingArguments=$true)][string[]]$LegacyArgs)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    foreach ($arg in $LegacyArgs) {
        switch ($arg) {
            '--simulate' { $Simulate = $true }
            '-s' { $Simulate = $true }
            '--skip-build' { $SkipBuild = $true }
            '--quiet' { $Quiet = $true }
            '-q' { $Quiet = $true }
            default { throw "Unknown argument: $arg" }
        }
    }
    Assert-Windows
    Set-Location -LiteralPath $ProjectRoot
    Require-Command 'npm.cmd'
    Require-File $VenvPython
    Require-File (Join-Path $ProjectRoot 'node_modules\.bin\electron.cmd')
    # 1. A previous GazeConnect (this checkout, or the installed app) is closed automatically: it
    #    needs the same tracker and ports, so the new launch could never work beside it.
    $fixedPorts = @(8765)
    if (-not $Simulate) { $fixedPorts += 5555 }
    $previous = @(Get-ProjectProcesses -IncludeInstalled)
    if ($previous.Count -gt 0) {
        Write-Host ('Closing the previous GazeConnect instance: ' + (($previous | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', '))
        Stop-ProjectProcesses -IncludeInstalled | Out-Null
        for ($wait = 0; $wait -lt 25; $wait++) {
            if (@($fixedPorts | Where-Object { @(Get-PortListeners $_).Count -gt 0 }).Count -eq 0) { break }
            Start-Sleep -Milliseconds 200
        }
    }
    # 2. The backend (8765) and the eye tracker helper (5555) keep fixed ports: the helper's is
    #    compiled in and both ends of the gaze link must agree. Only another program can hold them
    #    now; it is named and never stopped.
    foreach ($port in $fixedPorts) {
        if (@(Get-PortListeners $port).Count -gt 0) {
            throw "Port $port is needed by GazeConnect but is held by another program: $(Get-PortOwnerText $port). Close that program and launch again. It was not stopped."
        }
    }
    # 3. The interface server and the floor plan server move to the next free port when theirs is taken.
    $vitePort = Find-FreePort 5173 5183
    $floorplanPort = Find-FreePort 5050 5060
    if ($vitePort -ne 5173) { Write-Host "Port 5173 is busy ($(Get-PortOwnerText 5173)); using $vitePort for the interface server." }
    if ($floorplanPort -ne 5050) { Write-Host "Port 5050 is busy ($(Get-PortOwnerText 5050)); using $floorplanPort for the floor plan server." }
    $env:GAZECONNECT_VITE_PORT = [string]$vitePort
    $env:FLOORPLAN_PORT = [string]$floorplanPort
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
    # Files are per launch. High-frequency gaze lines stay off unless GAZE_DEBUG=1, so the
    # console shows start-up, connection, speech and error messages without flooding.
    $logDir = Join-Path $ProjectRoot 'tools\reports'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logPath = Join-Path $logDir ('dev-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    Write-Host "Starting application. Logs: $logPath"
    Write-Host 'To close: right-click the app and choose Exit App, press Ctrl+C here, or run .\stop-dev.bat from any terminal.'
    $launchExit = 0
    try {
        # The same two tasks as `npm run dev:electron`, with the chosen interface port handed to
        # Vite. cmd merges stderr first: Windows PowerShell 5.1 would otherwise wrap each native
        # stderr line in an error record. Tee keeps the same text in the log file.
        $launch = 'node_modules\.bin\npm-run-all.cmd --parallel --race "dev -- --port ' + $vitePort + '" electron:dev 2>&1'
        if ($Quiet) {
            & cmd.exe /d /c $launch *> $logPath
        } else {
            & cmd.exe /d /c $launch | Tee-Object -FilePath $logPath
        }
        $launchExit = $LASTEXITCODE
    } finally {
        # Also reached on Ctrl+C. Electron's own shutdown does not run then, so close what this
        # launch started (helper, backend interpreter, Vite) instead of leaving ports held.
        $closed = Stop-ProjectProcesses
        if ($closed -gt 0) { Write-Host "Closed $closed remaining GazeConnect process(es)." }
    }
    if ($launchExit -ne 0) {
        if ($Quiet) { Get-Content -LiteralPath $logPath -Tail 40 }
        throw "Development launch failed (exit code $launchExit); see $logPath"
    }
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
