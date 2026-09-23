# What is running from this checkout, and who holds the ports a launch needs. Reads
# only: nothing is started or stopped here.
# Exit code: 0 nothing of ours is running and the launch is clear, 1 GazeConnect is
# running, 2 a fixed port is held by a program that is not part of this checkout.
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    Write-Host ('GazeConnect development status - ' + $ProjectRoot)
    Write-Host ''
    $running = @(Get-ProjectProcesses -IncludeInstalled)
    if ($running.Count -eq 0) {
        Write-Host 'Application: not running.'
    } else {
        Write-Host 'Application: running.'
        foreach ($process in $running) {
            Write-Host ('  {0,-24} PID {1}' -f $process.Name, $process.ProcessId)
        }
        Write-Host '  (A closed window only hides the app in the notification area; it keeps its ports.)'
    }
    Write-Host ''
    Write-Host 'Ports'
    $rows = @(Get-DevPortState)
    foreach ($row in $rows) { Write-Host ('  ' + (Format-DevPortRow $row)) }
    Write-Host ''
    $blocked = @($rows | Where-Object { $_.Fixed -and @($_.Holders | Where-Object { -not $_.IsOurs }).Count -gt 0 })
    if ($blocked.Count -gt 0) {
        foreach ($row in $blocked) {
            Write-Host ('Port {0} ({1}) is held by a program that is not part of this checkout.' -f $row.Port, $row.Purpose)
            foreach ($holder in ($row.Holders | Where-Object { -not $_.IsOurs })) {
                if ($holder.Path) { Write-Host ('  ' + $holder.Path) }
            }
        }
        Write-Host 'Close that program yourself, or run .\stop-dev.bat --force to stop whatever holds 8765 and 5555.'
        exit 2
    }
    if ($running.Count -gt 0) {
        Write-Host 'GazeConnect is running. Close it with .\stop-dev.bat, Ctrl+C in its launch window, or right-click the app and choose Exit App.'
        exit 1
    }
    Write-Host 'Ready to launch: .\start-dev.bat'
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 3 }
