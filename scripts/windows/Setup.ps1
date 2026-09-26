# Prepares this checkout: Node packages exactly as package-lock.json, python\.venv with the pinned
# Python packages, and (unless -Simulate) the eye tracker helper. Safe to run again: verified steps
# are skipped and a broken or outdated python\.venv is rebuilt; -Force reinstalls both from scratch.
# -Python <python.exe> (or GAZECONNECT_PYTHON) chooses the interpreter python\.venv is made from.
param([switch]$Simulate, [switch]$Force, [string]$Python)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    Set-Location -LiteralPath $ProjectRoot
    $busy = @(Get-DependencyUsers)
    if ($busy.Count -gt 0) {
        throw ('Close GazeConnect first (.\stop-dev.bat): setup replaces files that these programs are using: ' +
            (($busy | ForEach-Object { '{0} (PID {1})' -f $_.Name, $_.ProcessId }) -join ', ') + '. Nothing was changed.')
    }
    Require-Command 'node.exe'
    Require-Command 'npm.cmd'
    if ($Simulate) { Invoke-Checked 'node.exe' @((Join-Path $PSScriptRoot 'check_node.cjs')) } else { Assert-BuildTools }
    # Decide about python\.venv before the long npm step, so a missing Python fails in seconds.
    $venvProblem = Get-VenvProblem
    if ($Force -and -not $venvProblem) { $venvProblem = 'is rebuilt from scratch (--force)' }
    $base = $null
    if ($venvProblem) { $base = Find-BasePython $Python }

    Write-Host '[1/3] Node packages'
    $nodeProblem = Get-NodeModulesProblem
    if ($Force -or $nodeProblem) {
        if ($Force) { Write-Host '  Reinstalling from package-lock.json (--force).' } else { Write-Host "  Installing: $nodeProblem." }
        Install-NodeDependencies
    } else {
        Write-Host '  Already match package-lock.json; npm ci skipped (--force reinstalls).'
        $electronProblem = Get-ElectronProgramProblem
        if ($electronProblem) {
            Write-Host "  Downloading Electron: $electronProblem."
            Install-ElectronProgram
        }
    }

    Write-Host '[2/3] Python environment (python\.venv)'
    # The stamp is written again only after everything below has been verified.
    Remove-Item -LiteralPath $PythonStamp -Force -ErrorAction SilentlyContinue
    if ($venvProblem) {
        Write-Host "  python\.venv $venvProblem."
        Write-Host "  Creating it with Python $($base.python) from $($base.executable)."
        if (Test-Path -LiteralPath $VenvDir) { Remove-GeneratedDirectory 'python\.venv' }
        Invoke-Checked $base.executable @('-m', 'venv', $VenvDir)
    }
    $venv = Get-PythonProbe $VenvPython
    if (-not $venv -or -not $venv.supported) { throw 'python\.venv does not run as Python 3.10+ x64 after creation.' }
    $pipInstall = @('-m', 'pip', 'install', '--disable-pip-version-check', '--require-virtualenv', '--no-input',
        '-r', $PythonRequirements, $PyInstallerSpec)
    if (('{0}.{1}' -f $venv.version[0], $venv.version[1]) -eq $PythonBaseline) {
        $pipInstall += @('-c', $PythonConstraints)
        Write-Host "  Python $($venv.python): installing the validated versions pinned in python\constraints.txt."
    } else {
        Write-Warning ("python\.venv is Python $($venv.python), but the validated versions in python\constraints.txt are for " +
            "Python $PythonBaseline, so the newest compatible versions are installed instead. For the validated set, " +
            "install Python $PythonBaseline x64 and run .\setup.bat --force.")
    }
    Invoke-Checked $VenvPython $pipInstall
    Invoke-Checked $VenvPython @('-m', 'pip', 'check', '--disable-pip-version-check')
    Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'check_python.py'), '--imports', '--pyinstaller')
    Write-SetupStamp $PythonStamp @{ requirementsSha256 = (Get-PythonRequirementsFingerprint); python = [string]$venv.python
        baseExecutable = [string]$venv.base_executable }

    if ($Simulate) {
        Write-Host '[3/3] Eye tracker helper: skipped (--simulate).'
    } else {
        Write-Host '[3/3] Eye tracker helper'
        Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'source', '--root', $ProjectRoot)
        Invoke-Checked 'dotnet.exe' @('build', $TobiiProject, '-c', 'Release', '-r', 'win-x64', '--nologo')
    }
    Write-Host 'Setup verified. Use start-dev.bat (hardware) or start-dev.bat --simulate (mouse).'
    Write-Host 'No device drivers, global runtimes, or system execution policies were installed/changed.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
