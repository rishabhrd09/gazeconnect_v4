param([switch]$Simulate)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    Set-Location -LiteralPath $ProjectRoot
    Require-Command 'python.exe'
    Require-Command 'node.exe'
    Require-Command 'npm.cmd'
    Invoke-Checked 'node.exe' @((Join-Path $PSScriptRoot 'check_node.cjs'))
    if (-not $Simulate) { Assert-BuildTools }
    Invoke-Checked 'python.exe' @((Join-Path $PSScriptRoot 'check_python.py'))
    Require-File (Join-Path $ProjectRoot 'package-lock.json')
    Invoke-Checked 'npm.cmd' @('ci')
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        if (Test-Path -LiteralPath (Join-Path $ProjectRoot 'python\.venv')) { throw 'Existing python/.venv is incomplete or from another OS. Rename it and rerun setup.' }
        Invoke-Checked 'python.exe' @('-m', 'venv', (Join-Path $ProjectRoot 'python\.venv'))
    }
    Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'check_python.py'))
    Invoke-Checked $VenvPython @('-m', 'pip', 'install', '-r', (Join-Path $ProjectRoot 'requirements.txt'), 'pyinstaller>=6,<7')
    Invoke-Checked $VenvPython @('-m', 'pip', 'check')
    Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'check_python.py'), '--imports', '--pyinstaller')
    if (-not $Simulate) {
        Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'source', '--root', $ProjectRoot)
        Invoke-Checked 'dotnet.exe' @('build', $TobiiProject, '-c', 'Release', '-r', 'win-x64', '--nologo')
    }
    Write-Host 'Setup verified. Use start-dev.bat (hardware) or start-dev.bat --simulate (mouse).'
    Write-Host 'No device drivers, global runtimes, or system execution policies were installed/changed.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
