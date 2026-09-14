# Finite parser check only; does not execute setup, build, drivers, or app processes.
$ErrorActionPreference = 'Stop'
$failed = $false
foreach ($file in (Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File)) {
    $parseTokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
    foreach ($problem in $parseErrors) {
        Write-Host ("{0}:{1}: {2}" -f $file.Name, $problem.Extent.StartLineNumber, $problem.Message)
        $failed = $true
    }
}
if ($failed) { exit 1 }
Write-Host 'All Windows release/development PowerShell files parsed successfully.'
