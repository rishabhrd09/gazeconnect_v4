# Close a development launch of this checkout from any terminal, then report the ports
# a launch needs. Other programs are left alone: --force is the only way this script
# stops something it cannot prove belongs here, it names it first, and it only ever
# touches the two fixed ports (8765 backend, 5555 eye tracker helper).
param([switch]$Force, [Parameter(ValueFromRemainingArguments=$true)][string[]]$LegacyArgs)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    foreach ($arg in $LegacyArgs) {
        switch ($arg) {
            '--force' { $Force = $true }
            '-f' { $Force = $true }
            default { throw "Unknown argument: $arg. Use --force." }
        }
    }
    $found = @(Get-ProjectProcesses)
    if ($found.Count -eq 0) {
        Write-Host 'GazeConnect is not running from this folder.'
    } else {
        $found | ForEach-Object { Write-Host ('Stopping {0} (PID {1})' -f $_.Name, $_.ProcessId) }
        Stop-ProjectProcesses | Out-Null
        Start-Sleep -Milliseconds 800
        $left = @(Get-ProjectProcesses)
        if ($left.Count -gt 0) {
            throw ('Still running: ' + (($left | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', '))
        }
        Write-Host 'GazeConnect stopped.'
    }
    # Stopping is only useful if the next launch works, so the ports are the real answer.
    Write-Host ''
    $stubborn = @()
    foreach ($row in (Get-DevPortState)) {
        Write-Host ('  ' + (Format-DevPortRow $row))
        if ($row.Fixed -and $row.Holders.Count -gt 0) { $stubborn += $row }
    }
    if ($stubborn.Count -eq 0) {
        Write-Host ''
        Write-Host 'Ports are free. Ready to launch: .\start-dev.bat'
        exit 0
    }
    if (-not $Force) {
        Write-Host ''
        Write-Host 'A program outside this checkout is holding a port GazeConnect needs (named above).'
        Write-Host 'Close it yourself, or run .\stop-dev.bat --force to stop it.'
        exit 1
    }
    foreach ($row in $stubborn) {
        foreach ($holder in $row.Holders) {
            Write-Host ('Force-stopping {0} (PID {1}), which holds port {2}' -f $holder.Name, $holder.ProcessId, $row.Port)
            & cmd.exe /d /c "taskkill /F /T /PID $($holder.ProcessId) >nul 2>&1"
        }
    }
    Start-Sleep -Milliseconds 800
    $remaining = @(Get-DevPortState | Where-Object { $_.Fixed -and $_.Holders.Count -gt 0 })
    if ($remaining.Count -gt 0) {
        foreach ($row in $remaining) { Write-Host ('  ' + (Format-DevPortRow $row)) }
        throw 'A fixed port is still held. Restarting Windows frees it; nothing further was stopped.'
    }
    Write-Host 'Ports are free. Ready to launch: .\start-dev.bat'
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
