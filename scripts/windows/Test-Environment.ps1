param([switch]$Simulate, [string]$InstalledPath)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    Set-Location -LiteralPath $ProjectRoot
    $logDir = Join-Path $ProjectRoot 'tools\reports'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $report = Join-Path $logDir ('windows-check-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    Start-Transcript -Path $report | Out-Null
    try {
        $osInfo = Get-CimInstance Win32_OperatingSystem
        Write-Host ("Windows: {0}; build {1}; {2}" -f $osInfo.Caption, $osInfo.BuildNumber, $osInfo.OSArchitecture)
        Write-Host "Checkout: $ProjectRoot"
        Invoke-Checked 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'Test-Scripts.ps1'))
        if ($InstalledPath) {
            # An installed app carries all runtimes; this path needs no global SDK.
            $resources = Join-Path ([IO.Path]::GetFullPath($InstalledPath)) 'resources'
            Require-File (Join-Path $InstalledPath 'GazeConnect Pro.exe')
            Require-File (Join-Path $resources 'app.asar')
            Require-File (Join-Path $resources 'tobii-helper\TobiiGazeHelper.exe')
            Require-File (Join-Path $resources 'tobii-helper\coreclr.dll')
            Require-File (Join-Path $resources 'tobii-helper\hostpolicy.dll')
            Invoke-Checked (Join-Path $resources 'python\backend\GazeConnectBackend.exe') @('--self-test')
            Invoke-Checked (Join-Path $resources 'python\floorplan\GazeConnectFloorplan.exe') @('--self-test')
        } else {
            Require-Command 'node.exe'
            Require-Command 'npm.cmd'
            Require-File $VenvPython
            Require-File (Join-Path $ProjectRoot 'node_modules\.bin\electron.cmd')
            Invoke-Checked 'node.exe' @((Join-Path $PSScriptRoot 'check_node.cjs'))
            Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'check_python.py'))
            Invoke-Checked $VenvPython @('-m', 'pip', 'check')
            # Uses the same imports/model/render/solver probes as frozen packages.
            $previousPythonPath = $env:PYTHONPATH
            try {
                $env:PYTHONPATH = (Join-Path $ProjectRoot 'python') + ';' + (Join-Path $ProjectRoot 'tools')
                Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'backend_entry.py'), '--self-test')
                Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'floorplan_entry.py'), '--self-test')
            } finally { $env:PYTHONPATH = $previousPythonPath }
            if (-not $Simulate) {
                Assert-BuildTools
                Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'source', '--root', $ProjectRoot)
                Require-File (Join-Path $ProjectRoot 'tobii-helper\TobiiGazeHelper\bin\Release\net8.0-windows\win-x64\TobiiGazeHelper.exe')
            }
        }
        $ports = @(8765, 5050)
        if (-not $InstalledPath) { $ports += 5173 }
        if (-not $Simulate) { $ports += 5555 }
        Assert-FreePorts $ports
        Write-Host 'Readiness checks passed. No tracker or app server was started.'
        Write-Host 'Next: start-dev.bat, or launch your installed app and test Tobii calibration/selection.'
        Write-Host 'Driver availability, gaze accuracy and hardware reconnect require that live test.'
    } finally { Stop-Transcript | Out-Null }
    Write-Host "Report: $report"
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
