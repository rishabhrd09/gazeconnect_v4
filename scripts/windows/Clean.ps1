param([switch]$Dependencies)
. (Join-Path $PSScriptRoot 'Common.ps1')
try {
    Assert-Windows
    foreach ($path in @('dist', 'dist-electron', 'python-dist', 'tobii-dist')) { Remove-GeneratedDirectory $path }
    if ($Dependencies) {
        Remove-GeneratedDirectory 'node_modules'
        Remove-GeneratedDirectory 'python\.venv'
    }
    Write-Host 'Generated outputs cleaned. Saved data and previous release installers were preserved.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
