# Close a development launch of this checkout from any terminal. Other applications are left alone.
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    $found = @(Get-ProjectProcesses)
    if ($found.Count -eq 0) { Write-Host 'GazeConnect is not running from this folder.'; exit 0 }
    $found | ForEach-Object { Write-Host ("Stopping {0} (PID {1})" -f $_.Name, $_.ProcessId) }
    Stop-ProjectProcesses | Out-Null
    Start-Sleep -Milliseconds 800
    $left = @(Get-ProjectProcesses)
    if ($left.Count -gt 0) { throw ("Still running: " + (($left | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', ')) }
    Write-Host 'GazeConnect stopped.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
