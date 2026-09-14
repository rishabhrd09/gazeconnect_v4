param([switch]$Distribution, [string]$ApprovalFile)
. (Join-Path $PSScriptRoot 'Common.ps1')
$work = $null
try {
    Assert-Windows
    Set-Location -LiteralPath $ProjectRoot
    Assert-BuildTools
    Require-File $VenvPython
    Require-File (Join-Path $ProjectRoot 'package-lock.json')
    Require-File (Join-Path $ProjectRoot 'build\icon.ico')
    Invoke-Checked $VenvPython @('-m', 'pip', 'check')
    Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'check_python.py'), '--pyinstaller')
    Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'source', '--root', $ProjectRoot)

    # Build local validation candidates by default. Distribution needs a reviewed,
    # external record that names the actual SDK binaries and Windows test evidence.
    if ($Distribution) {
        Require-File $ApprovalFile
        $approval = Get-Content -LiteralPath $ApprovalFile -Raw | ConvertFrom-Json
        if ($approval.distributionApproved -ne $true -or
            [string]::IsNullOrWhiteSpace($approval.vendorAgreementReference) -or
            [string]::IsNullOrWhiteSpace($approval.windowsHardwareTestReport) -or
            [string]::IsNullOrWhiteSpace($approval.thirdPartyNoticesPath)) {
            throw 'Distribution approval must include vendor agreement, Windows/hardware test report and third-party notices.'
        }
        Require-File $approval.windowsHardwareTestReport
        Require-File $approval.thirdPartyNoticesPath
        foreach ($name in $TobiiDlls) {
            $actual = (Get-FileHash -LiteralPath (Join-Path $TobiiLib $name) -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($approval.vendorSha256.$name -ne $actual) { throw "Distribution approval does not cover current DLL: $name" }
        }
    }
    # Never package an arbitrary/stale node_modules tree from a previous checkout.
    Invoke-Checked 'npm.cmd' @('ci')
    Require-File (Join-Path $ProjectRoot 'node_modules\.bin\electron-builder.cmd')
    $runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $work = Join-Path ([IO.Path]::GetTempPath()) ('gazeconnect-build-' + $runId)
    New-Item -ItemType Directory -Path $work | Out-Null
    $pyOutput = Join-Path $work 'pyinstaller-output'
    $common = @('-m', 'PyInstaller', '--onedir', '--noconfirm', '--clean',
        '--distpath', $pyOutput, '--workpath', (Join-Path $work 'pyinstaller-work'),
        '--specpath', $work, '--paths', (Join-Path $ProjectRoot 'python'),
        '--paths', (Join-Path $ProjectRoot 'tools'), '--exclude-module', 'torch',
        '--exclude-module', 'pytest')

    Write-Host '[1/5] Building frozen backend and floor-plan service...'
    $backendArgs = $common + @('--name', 'GazeConnectBackend',
        '--add-data', ((Join-Path $ProjectRoot 'python\data\smart_bigrams.json') + ';data'),
        '--add-data', ((Join-Path $ProjectRoot 'python\ml\trained_models\gazeconnect_lm_quantized.onnx') + ';ml/trained_models'),
        '--add-data', ((Join-Path $ProjectRoot 'python\ml\trained_models\vocabulary.json') + ';ml/trained_models'),
        '--collect-all', 'onnxruntime', '--hidden-import', 'ml.inference', '--hidden-import', 'ml.fusion',
        '--hidden-import', 'websockets.legacy.server', '--hidden-import', 'pyttsx3.drivers.sapi5',
        (Join-Path $PSScriptRoot 'backend_entry.py'))
    Invoke-Checked $VenvPython $backendArgs
    $floorplanArgs = $common + @('--name', 'GazeConnectFloorplan',
        '--collect-all', 'cairo', '--collect-all', 'ortools', '--collect-all', 'shapely',
        '--collect-all', 'ezdxf', '--hidden-import', 'gazeplan_engine_v5.engine',
        (Join-Path $PSScriptRoot 'floorplan_entry.py'))
    Invoke-Checked $VenvPython $floorplanArgs
    $pythonStage = Join-Path $work 'python-dist'
    New-Item -ItemType Directory -Path $pythonStage | Out-Null
    Move-Item -LiteralPath (Join-Path $pyOutput 'GazeConnectBackend') -Destination (Join-Path $pythonStage 'backend')
    Move-Item -LiteralPath (Join-Path $pyOutput 'GazeConnectFloorplan') -Destination (Join-Path $pythonStage 'floorplan')

    Write-Host '[2/5] Publishing Tobii helper with its own x64 .NET runtime...'
    Invoke-Checked 'dotnet.exe' @('publish', $TobiiProject, '-c', 'Release', '-r', 'win-x64',
        '--self-contained', 'true', '-p:PublishTrimmed=false', '-p:PublishSingleFile=false',
        '-o', (Join-Path $work 'tobii-dist'), '--nologo')
    Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'stage', '--root', $work)
    # These finite checks start no gaze streams or servers and need no tracker.
    Invoke-Checked (Join-Path $pythonStage 'backend\GazeConnectBackend.exe') @('--self-test')
    Invoke-Checked (Join-Path $pythonStage 'floorplan\GazeConnectFloorplan.exe') @('--self-test')

    Write-Host '[3/5] Building frontend and Electron...'
    Remove-GeneratedDirectory 'dist'
    Remove-GeneratedDirectory 'dist-electron'
    Invoke-Checked 'npm.cmd' @('run', 'build')
    Invoke-Checked 'npm.cmd' @('run', 'build:electron')
    Require-File (Join-Path $ProjectRoot 'dist\index.html')
    Require-File (Join-Path $ProjectRoot 'dist-electron\main.js')

    Write-Host '[4/5] Staging validated runtimes...'
    Remove-GeneratedDirectory 'python-dist'
    Remove-GeneratedDirectory 'tobii-dist'
    Move-Item -LiteralPath $pythonStage -Destination (Join-Path $ProjectRoot 'python-dist')
    Move-Item -LiteralPath (Join-Path $work 'tobii-dist') -Destination (Join-Path $ProjectRoot 'tobii-dist')
    $notice = if ($Distribution) { $approval.thirdPartyNoticesPath } else { Join-Path $ProjectRoot 'docs\windows-release-audit.md' }
    Copy-Item -LiteralPath $notice -Destination (Join-Path $ProjectRoot 'python-dist\THIRD-PARTY-RELEASE-STATUS.txt')
    $package = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
    $manifest = [ordered]@{
        schemaVersion = 1; appVersion = $package.version; createdUtc = [DateTime]::UtcNow.ToString('o')
        distributionApproved = [bool]$Distribution
        status = $(if ($Distribution) { 'approved-by-external-release-record' } else { 'LOCAL-VALIDATION-CANDIDATE-NOT-FOR-DISTRIBUTION' })
        node = (& node.exe --version); dotnetSdk = (& dotnet.exe --version)
        python = (& $VenvPython --version); pythonPackages = @(& $VenvPython -m pip freeze)
        packageLockSha256 = (Get-FileHash -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Algorithm SHA256).Hash
        vendorSha256 = [ordered]@{}
        knownValidationLimit = 'Build self-tests do not certify clean-machine install, hardware performance, signing, security, or vendor license scope.'
    }
    foreach ($name in $TobiiDlls) { $manifest.vendorSha256[$name] = (Get-FileHash -LiteralPath (Join-Path $TobiiLib $name) -Algorithm SHA256).Hash }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $ProjectRoot 'python-dist\build-manifest.json') -Encoding UTF8
    $releaseDir = Join-Path $ProjectRoot ('release\' + $runId)
    $candidateReleaseDir = Join-Path $work 'installer-output'
    Write-Host '[5/5] Creating installer in a new release directory...'
    Invoke-Checked (Join-Path $ProjectRoot 'node_modules\.bin\electron-builder.cmd') @('--win', '--x64', ('--config.directories.output=' + $candidateReleaseDir))
    $installers = @(Get-ChildItem -LiteralPath $candidateReleaseDir -Filter '*.exe' -File)
    if ($installers.Count -eq 0) { throw 'electron-builder did not produce an installer.' }
    # Verify what electron-builder actually copied, not only source staging.
    $unpacked = Join-Path $candidateReleaseDir 'win-unpacked\resources'
    # Validate electron-builder's resource layout separately from source staging.
    Invoke-Checked $VenvPython @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'packaged', '--root', $unpacked)
    Invoke-Checked (Join-Path $unpacked 'python\backend\GazeConnectBackend.exe') @('--self-test')
    Invoke-Checked (Join-Path $unpacked 'python\floorplan\GazeConnectFloorplan.exe') @('--self-test')
    # Failed packaging/self-tests leave no apparently finished installer in release/.
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot 'release') | Out-Null
    Move-Item -LiteralPath $candidateReleaseDir -Destination $releaseDir
    $installers = @(Get-ChildItem -LiteralPath $releaseDir -Filter '*.exe' -File)
    $installers | Get-FileHash -Algorithm SHA256 | Select-Object Path, Hash | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $releaseDir 'installer-sha256.json') -Encoding UTF8
    Copy-Item -LiteralPath (Join-Path $ProjectRoot 'python-dist\build-manifest.json') -Destination $releaseDir
    Write-Host "Installer candidate verified: $releaseDir"
    if (-not $Distribution) { Write-Warning 'LOCAL VALIDATION ONLY. Complete the release gates in docs/windows-release-audit.md before sharing.' }
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
finally {
    # Only this invocation's unique temporary work tree is removed.
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Recurse -Force }
}
