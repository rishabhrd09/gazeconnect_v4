param([string]$SourceDirectory = (Join-Path $env:ProgramFiles 'Tobii\Tobii EyeX'))
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    Require-Command 'python.exe'
    # Validate the complete set before overwriting any local SDK file.
    Invoke-Checked 'python.exe' @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'dlls', '--root', $SourceDirectory)
    New-Item -ItemType Directory -Force -Path $TobiiLib | Out-Null
    foreach ($name in $TobiiDlls) { Copy-Item -LiteralPath (Join-Path $SourceDirectory $name) -Destination (Join-Path $TobiiLib $name) -Force }
    Invoke-Checked 'python.exe' @((Join-Path $ProjectRoot 'scripts\verify_windows_bundle.py'), 'source', '--root', $ProjectRoot)
    Write-Host 'Validated local SDK inputs copied. This does not grant redistribution or AAC-use rights.'
    Write-Host 'Record the vendor package, agreement and hashes before any public release; see docs/windows-release-audit.md.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
