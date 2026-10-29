# Installs the newest GazeConnect build made in this checkout (29 Oct 2026; double-click install-latest.bat).
# Before the installer runs:
#   - the newest folder in release\ is taken (build-installer.bat names each after the date and time it
#     started, and moves it there only once the build has verified it);
#   - the installer's SHA-256 must equal the one installer-sha256.json recorded at the end of that build,
#     so a changed or damaged file is never run, and a signature, when there is one, must be valid;
#   - what it is (version, when and from which commit it was built, its status) is shown;
#   - a running GazeConnect, which the installer cannot replace, is closed only if the person agrees;
#   - the person confirms the installation.
# The installer then runs with this user's rights, exactly as when it is double-clicked (it asks where and
# for whom to install). Nothing is downloaded and no setting is changed.
# --check (-Check): every check above, without closing anything or installing.
param([switch]$Check, [string]$ReleaseRoot, [Parameter(ValueFromRemainingArguments = $true)][string[]]$LegacyArgs)
. (Join-Path $PSScriptRoot 'Common.ps1')

function Read-JsonFile([string]$Path) {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Get-JsonValue($Object, [string]$Name) {
    $property = $Object.PSObject.Properties[$Name]
    if ($property) { return $property.Value }
    return $null
}

function Confirm-Step([string]$Question) {
    $answer = Read-Host "$Question Type Y and press Enter (anything else stops here)"
    return ([string]$answer).Trim() -match '^(y|yes)$'
}

try {
    foreach ($arg in $LegacyArgs) {
        switch ($arg) {
            '--check' { $Check = $true }
            default { throw "Unknown argument: $arg. Use --check to check the newest build without installing it." }
        }
    }
    Assert-Windows
    if (-not $ReleaseRoot) { $ReleaseRoot = Join-Path $ProjectRoot 'release' }
    if (-not (Test-Path -LiteralPath $ReleaseRoot -PathType Container)) {
        throw "There is no build yet ($ReleaseRoot does not exist). Run .\build-installer.bat first."
    }
    # build-installer.bat's run ids are yyyyMMdd-HHmmss-<8 hex>, so the newest sorts last.
    $runs = @(Get-ChildItem -LiteralPath $ReleaseRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}-[0-9a-f]{8}$' } | Sort-Object Name)
    if ($runs.Count -eq 0) { throw "There is no build in $ReleaseRoot. Run .\build-installer.bat first." }
    $run = $runs[$runs.Count - 1]
    $installers = @(Get-ChildItem -LiteralPath $run.FullName -Filter 'GazeConnect Pro Setup *.exe' -File)
    $hashFile = Join-Path $run.FullName 'installer-sha256.json'
    $manifestFile = Join-Path $run.FullName 'build-manifest.json'
    if ($installers.Count -ne 1 -or -not (Test-Path -LiteralPath $hashFile) -or -not (Test-Path -LiteralPath $manifestFile)) {
        throw ("The newest build, $($run.FullName), is incomplete: it needs one installer, installer-sha256.json and " +
            'build-manifest.json. Nothing was installed. Run .\build-installer.bat again.')
    }
    $installer = $installers[0]

    # The checksum the build recorded for this file.
    $recorded = @(Read-JsonFile $hashFile) | Where-Object { [IO.Path]::GetFileName([string](Get-JsonValue $_ 'Path')) -eq $installer.Name } | Select-Object -First 1
    $recordedHash = if ($recorded) { [string](Get-JsonValue $recorded 'Hash') } else { '' }
    if ($recordedHash -notmatch '^[0-9A-Fa-f]{64}$') {
        throw "installer-sha256.json has no checksum for $($installer.Name). Nothing was installed."
    }
    Write-Host "Checking $($installer.Name) ($([math]::Round($installer.Length / 1MB, 1)) MB)..."
    $actualHash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
    if ($actualHash -ne $recordedHash.ToUpperInvariant()) {
        throw ("This installer is not the file the build made (SHA-256 $actualHash, recorded $recordedHash): it may be damaged " +
            'or changed. Nothing was installed. Run .\build-installer.bat again.')
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
    if ($signature.Status -ne 'NotSigned' -and $signature.Status -ne 'Valid') {
        throw "The installer's signature is $($signature.Status). Nothing was installed."
    }

    $manifest = Read-JsonFile $manifestFile
    $version = [string](Get-JsonValue $manifest 'appVersion')
    $createdUtc = [string](Get-JsonValue $manifest 'createdUtc')
    $built = [DateTime]::Parse($createdUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToLocalTime()
    $commit = [string](Get-JsonValue $manifest 'gitCommit')
    $changes = Get-JsonValue $manifest 'gitUncommittedChanges'
    $source = if ($commit -match '^[0-9a-f]{40}$') {
        "commit $($commit.Substring(0, 7))" + $(if ($changes -eq 0) { ' (no uncommitted changes)' } elseif ($null -ne $changes) { " plus $changes uncommitted change(s)" } else { '' })
    } else { 'an unrecorded commit' }
    $status = [string](Get-JsonValue $manifest 'status')
    Write-Host ''
    Write-Host "GazeConnect Pro $version"
    Write-Host "  Installer : $($installer.FullName)"
    Write-Host ("  Built     : {0:d MMM yyyy HH:mm} from {1}" -f $built, $source)
    Write-Host "  Status    : $status"
    Write-Host "  SHA-256   : $actualHash (matches the build's record)"
    Write-Host ('  Signature : ' + $(if ($signature.Status -eq 'Valid') { "valid ($($signature.SignerCertificate.Subject))" } else { 'not signed (code signing is still to come)' }))
    Write-Host ''

    $running = @(Get-ProjectProcesses -IncludeInstalled)
    $runningText = ($running | ForEach-Object { "$($_.Name) (PID $($_.ProcessId))" }) -join ', '
    if ($Check) {
        if ($running.Count -gt 0) { Write-Host "GazeConnect is running ($runningText); installing would ask to close it first." }
        Write-Host 'Check only: this build is ready to install. Nothing was closed or installed.'
        exit 0
    }
    if ($running.Count -gt 0) {
        Write-Host "GazeConnect is running: $runningText. The installer cannot replace it while it runs."
        if (-not (Confirm-Step 'Close GazeConnect now?')) { throw 'GazeConnect was left running. Nothing was installed.' }
        Stop-ProjectProcesses -IncludeInstalled | Out-Null
        for ($wait = 0; $wait -lt 25 -and @(Get-ProjectProcesses -IncludeInstalled).Count -gt 0; $wait++) { Start-Sleep -Milliseconds 200 }
        if (@(Get-ProjectProcesses -IncludeInstalled).Count -gt 0) { throw 'GazeConnect did not close. Nothing was installed; close it and try again.' }
        Write-Host 'GazeConnect closed.'
    }
    if (-not (Confirm-Step "Install GazeConnect Pro $version now?")) {
        Write-Host 'Nothing was installed.'
        exit 0
    }
    Write-Host 'Starting the installer. Follow its steps; "Only for me" is fine when it asks whom to install for.'
    $process = Start-Process -FilePath $installer.FullName -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "The installer ended with code $($process.ExitCode): it was cancelled or did not finish." }
    Write-Host 'Installed. Settings, phrases and the music library (Music\GazeConnect Pro) are kept.'
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
