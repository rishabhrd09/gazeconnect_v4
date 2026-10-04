# Shared by the Windows entry points. Compatible with Windows PowerShell 5.1.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:VenvDir = Join-Path $ProjectRoot 'python\.venv'
$script:VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
$script:PackageLock = Join-Path $ProjectRoot 'package-lock.json'
$script:PythonRequirements = Join-Path $ProjectRoot 'requirements.txt'
# Exact package versions validated with $PythonBaseline x64; see the file's header.
$script:PythonConstraints = Join-Path $ProjectRoot 'python\constraints.txt'
$script:PythonBaseline = '3.12'
# Installed beside the requirements: the installer build needs it, the app does not.
$script:PyInstallerSpec = 'pyinstaller>=6,<7'
# Written by setup only after a complete, verified install, and read by the launchers instead of
# starting an interpreter or npm. Each lives inside what it describes, so deleting one deletes both.
$script:PythonStamp = Join-Path $VenvDir 'gazeconnect-setup.json'
$script:NodeStamp = Join-Path $ProjectRoot 'node_modules\.gazeconnect-setup.json'
$script:TobiiProject = Join-Path $ProjectRoot 'tobii-helper\TobiiGazeHelper\TobiiGazeHelper.csproj'
$script:TobiiLib = Join-Path $ProjectRoot 'tobii-helper\TobiiGazeHelper\lib'
$script:TobiiDlls = @('Tobii.Interaction.Net.dll', 'Tobii.Interaction.Model.dll',
    'Tobii.EyeX.Client.dll', 'Tobii.EyeX.Common.dll', 'tobii_stream_engine.dll',
    'Tobii.Tech.NETCommon.ClrExtensions.dll')

function Assert-Windows {
    if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
        throw 'This workflow requires Windows 10/11 x64. Cross-compiling PyInstaller is unsupported.'
    }
    if ([Environment]::OSVersion.Version -lt [version]'10.0') {
        throw 'Windows 10 or Windows 11 is required.'
    }
}
function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Missing tool: $Name" }
}
function Require-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing required file: $Path" }
    if ((Get-Item -LiteralPath $Path).Length -eq 0) { throw "Empty required file: $Path" }
}
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments = @())
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
function Assert-BuildTools {
    Require-Command 'node.exe'
    Require-Command 'npm.cmd'
    Require-Command 'dotnet.exe'
    # Match the current dependency floor; use a supported Node LTS for release work.
    Invoke-Checked 'node.exe' @((Join-Path $PSScriptRoot 'check_node.cjs'))
    $sdks = & dotnet.exe --list-sdks
    if ($LASTEXITCODE -ne 0 -or -not ($sdks -match '^8\.')) { throw 'Install the .NET 8 SDK (latest serviced patch) for this helper target.' }
}
function Assert-FreePorts([int[]]$Ports) {
    # Inspect listeners only. Never kill a process by name or by its port.
    # Filtering in PowerShell also handles a machine with no listeners: the
    # cmdlet's -State filter can raise ObjectNotFound for an empty result.
    $listeners = @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.State -eq 'Listen' })
    foreach ($port in $Ports) {
        $matches = @($listeners | Where-Object { $_.LocalPort -eq $port })
        if ($matches.Count -gt 0) {
            $owners = ($matches | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
            throw "Port $port is already in use (PID $owners). Close its owning app before launching. No process was stopped."
        }
    }
}
function Remove-GeneratedDirectory([string]$RelativePath) {
    # Restrict deletion to explicit generated directories inside this checkout.
    $allowed = @('dist', 'dist-electron', 'python-dist', 'tobii-dist', 'node_modules', 'python\.venv')
    if ($RelativePath -notin $allowed) { throw "Refusing unexpected cleanup path: $RelativePath" }
    $target = Join-Path $ProjectRoot $RelativePath
    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing to remove linked directory: $target" }
        # Windows PowerShell 5.1 has differing junction-deletion behavior. Detect
        # every link without traversing it before allowing recursive removal.
        $pending = New-Object 'System.Collections.Generic.Stack[string]'
        $pending.Push($target)
        while ($pending.Count -gt 0) {
            foreach ($entry in (Get-ChildItem -LiteralPath ($pending.Pop()) -Force)) {
                if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing cleanup containing a linked path: $($entry.FullName)" }
                if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
            }
        }
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}
function Get-ProjectProcesses {
    # Processes that verifiably belong to a development launch from THIS checkout: matched on the
    # executable or script path inside $ProjectRoot, never on a generic process name or a port alone.
    # Vite counts only without --port or inside the launcher's own range (5173-5183), so another
    # tool's preview server on its own port is never touched.
    # -IncludeInstalled adds the packaged application, whose binaries have unique product names and
    # which needs the same tracker and ports, so it cannot run beside a development launch anyway.
    param([switch]$IncludeInstalled)
    $installedNames = @('GazeConnect Pro.exe', 'GazeConnectBackend.exe', 'GazeConnectFloorplan.exe')
    $root = $ProjectRoot.TrimEnd('\')
    $rootPattern = [regex]::Escape($root)
    @(Get-CimInstance Win32_Process | Where-Object {
        $cmd = [string]$_.CommandLine
        $exe = [string]$_.ExecutablePath
        $name = [string]$_.Name   # inside switch, $_ is the switch value
        switch ($name) {
            'electron.exe' { ($exe -like "$root\node_modules\electron\*") -and ($cmd -match 'electron\.exe"?\s+\.\s*$') }
            'TobiiGazeHelper.exe' { $IncludeInstalled -or ($exe -like "$root\tobii-helper\*") }
            'python.exe' { $cmd -match ($rootPattern + '\\(python\\main\.py|tools\\floorplan_server\.py)') }
            'node.exe' {
                ($cmd -match ($rootPattern + '\\node_modules\\')) -and
                ($cmd -match 'electron\\cli\.js"?\s+\.\s*$|npm-run-all|vite\\bin\\vite\.js"?(\s+--port\s+51(7[3-9]|8[0-3]))?\s*$')
            }
            default { $IncludeInstalled -and ($name -in $installedNames) }
        }
    })
}
function Stop-ProjectProcesses {
    # Tree-kill so the interpreter behind the venv python launcher, and Electron's children, go too.
    param([switch]$IncludeInstalled)
    $stopped = 0
    foreach ($process in (Get-ProjectProcesses -IncludeInstalled:$IncludeInstalled)) {
        if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
            # An earlier tree-kill in this loop may already have ended it; taskkill then reports
            # "not found" on stderr, which Windows PowerShell 5.1 would raise as an error under
            # ErrorActionPreference=Stop. cmd discards the output, so only the exit code remains.
            & cmd.exe /d /c "taskkill /F /T /PID $($process.ProcessId) >nul 2>&1"
            $stopped++
        }
    }
    return $stopped
}
function Test-HelperUpToDate {
    # True when the built helper is newer than every file it is built from. The
    # .NET build is incremental already, but starting it costs about five seconds
    # on every launch and the helper changes rarely. Touch a source file, or delete
    # its bin folder, to force a rebuild.
    $exe = Join-Path $ProjectRoot 'tobii-helper\TobiiGazeHelper\bin\Release\net8.0-windows\win-x64\TobiiGazeHelper.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { return $false }
    $built = (Get-Item -LiteralPath $exe).LastWriteTimeUtc
    $buildable = @('.cs', '.csproj', '.props', '.targets', '.dll', '.json')
    $sources = Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'tobii-helper') -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' -and $buildable -contains $_.Extension }
    foreach ($source in $sources) {
        if ($source.LastWriteTimeUtc -gt $built) { return $false }
    }
    return $true
}
function Test-InterfaceBuildUpToDate {
    # True when dist/ is newer than every file the interface is built from.
    $built = Join-Path $ProjectRoot 'dist\index.html'
    if (-not (Test-Path -LiteralPath $built -PathType Leaf)) { return $false }
    $builtAt = (Get-Item -LiteralPath $built).LastWriteTimeUtc
    $watched = @('src', 'public') | ForEach-Object { Join-Path $ProjectRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
    foreach ($file in (Get-ChildItem -LiteralPath $watched -Recurse -File -ErrorAction SilentlyContinue)) {
        if ($file.LastWriteTimeUtc -gt $builtAt) { return $false }
    }
    foreach ($name in @('index.html', 'vite.config.ts', 'package.json', 'tsconfig.json')) {
        $path = Join-Path $ProjectRoot $name
        if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).LastWriteTimeUtc -gt $builtAt) { return $false }
    }
    return $true
}
function Test-ElectronBuildUpToDate {
    # True when dist-electron is newer than every TypeScript file it is built from.
    $built = Join-Path $ProjectRoot 'dist-electron\main.js'
    if (-not (Test-Path -LiteralPath $built -PathType Leaf)) { return $false }
    $builtAt = (Get-Item -LiteralPath $built).LastWriteTimeUtc
    $sources = Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'electron') -Recurse -File -Filter *.ts -ErrorAction SilentlyContinue
    foreach ($file in $sources) {
        if ($file.LastWriteTimeUtc -gt $builtAt) { return $false }
    }
    $config = Join-Path $ProjectRoot 'tsconfig.electron.json'
    if ((Test-Path -LiteralPath $config) -and (Get-Item -LiteralPath $config).LastWriteTimeUtc -gt $builtAt) { return $false }
    return $true
}
function Get-PortListeners([int]$Port) {
    @(Get-NetTCPConnection -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Listen' -and $_.LocalPort -eq $Port } |
        Select-Object -ExpandProperty OwningProcess -Unique)
}
function Get-PortOwnerText([int]$Port) {
    # Names the program so the message is actionable without Task Manager.
    $parts = foreach ($id in (Get-PortListeners $Port)) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
        if ($owner) { "{0} (PID {1}) {2}" -f $owner.Name, $id, $owner.ExecutablePath } else { "PID $id" }
    }
    return ($parts -join '; ')
}
function Find-FreePort([int]$Preferred, [int]$Last) {
    $listening = @(Get-NetTCPConnection -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Listen' } | Select-Object -ExpandProperty LocalPort -Unique)
    for ($port = $Preferred; $port -le $Last; $port++) {
        if ($listening -notcontains $port) { return $port }
    }
    throw "No free port between $Preferred and $Last. $Preferred is held by: $(Get-PortOwnerText $Preferred)"
}

# The ports a development launch uses. 8765 and 5555 are fixed: the interface always
# dials 8765 (the default in src/hooks/useWebSocket.tsx) and the helper's port is
# compiled in, so a held one blocks the launch rather than moving it elsewhere. The
# other two move to the next free port and are listed only so the picture is complete.
$script:DevPorts = @(
    [pscustomobject]@{ Port = 8765; Purpose = 'backend'; Fixed = $true }
    [pscustomobject]@{ Port = 5555; Purpose = 'eye tracker helper'; Fixed = $true }
    [pscustomobject]@{ Port = 5173; Purpose = 'interface server'; Fixed = $false }
    [pscustomobject]@{ Port = 5050; Purpose = 'floor plan server'; Fixed = $false }
)

function Get-DevPortState {
    # One row per port with its listeners, and whether each one is part of this
    # checkout (or the installed app) - which is what decides who may stop it.
    $ours = @{}
    foreach ($process in (Get-ProjectProcesses -IncludeInstalled)) { $ours[[int]$process.ProcessId] = $true }
    foreach ($entry in $script:DevPorts) {
        $holders = foreach ($id in (Get-PortListeners $entry.Port)) {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
            $name = "PID $id"
            $path = ''
            if ($owner) { $name = [string]$owner.Name; $path = [string]$owner.ExecutablePath }
            [pscustomobject]@{ ProcessId = [int]$id; Name = $name; Path = $path; IsOurs = $ours.ContainsKey([int]$id) }
        }
        [pscustomobject]@{ Port = $entry.Port; Purpose = $entry.Purpose; Fixed = $entry.Fixed; Holders = @($holders) }
    }
}

function Format-DevPortRow([object]$Row) {
    if ($Row.Holders.Count -eq 0) { return ('{0,-5} {1,-19} free' -f $Row.Port, $Row.Purpose) }
    $who = ($Row.Holders | ForEach-Object {
        $tag = 'not part of this checkout'
        if ($_.IsOurs) { $tag = 'this checkout' }
        '{0} (PID {1}, {2})' -f $_.Name, $_.ProcessId, $tag
    }) -join '; '
    return ('{0,-5} {1,-19} held by {2}' -f $Row.Port, $Row.Purpose, $who)
}

# ---- Dependencies: interpreter choice, python\.venv, node_modules ----

function Get-PythonProbe {
    # Describes one interpreter (check_python.py --probe), or $null when it cannot run: not
    # installed, a Microsoft Store alias with nothing behind it, a venv whose base Python is gone.
    param([string]$Command, [string[]]$Prefix = @())
    $previous = $ErrorActionPreference
    # A failing candidate's stderr is an answer here, not an error: under Stop, Windows
    # PowerShell 5.1 would raise its first redirected line.
    $ErrorActionPreference = 'Continue'
    try {
        $output = @(& $Command @Prefix (Join-Path $PSScriptRoot 'check_python.py') '--probe' 2>$null)
        if ($LASTEXITCODE -ne 0) { return $null }
        $json = @($output | Where-Object { "$_" -match '^\s*\{' }) | Select-Object -Last 1
        if (-not $json) { return $null }
        return ($json | ConvertFrom-Json)
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Find-BasePython {
    # The interpreter python\.venv is made from. PATH order alone is not trusted: on the
    # maintainer's machine an older Python 3.9 comes first there. Order: -Python or
    # GAZECONNECT_PYTHON when given (then nothing else), the validated 3.12 through the py
    # launcher, the other supported versions, then each python.exe on PATH.
    param([string]$Requested)
    # A virtual environment's interpreter (an activated venv on PATH, python\.venv itself) is
    # replaced by the Python it was made from: a rebuild would otherwise delete what it runs.
    function Resolve-Base($probe) {
        if ($probe -and $probe.supported -and $probe.in_venv) { $probe = Get-PythonProbe ([string]$probe.base_executable) }
        return $probe
    }
    if (-not $Requested) { $Requested = $env:GAZECONNECT_PYTHON }
    if ($Requested) {
        $probe = $null
        if (Test-Path -LiteralPath $Requested -PathType Leaf) { $probe = Resolve-Base (Get-PythonProbe $Requested) }
        if (-not $probe -or -not $probe.supported) { throw "The requested Python '$Requested' did not run as Python 3.10+ x64." }
        return $probe
    }
    # A probe must never install anything (the py launcher can offer winget or the Store).
    Remove-Item Env:PYLAUNCHER_ALLOW_INSTALL -ErrorAction SilentlyContinue
    $rejected = @{}
    if (Get-Command 'py.exe' -ErrorAction SilentlyContinue) {
        foreach ($tag in @('-3.12-64', '-3.11-64', '-3.10-64', '-3.13-64', '-3-64')) {
            $probe = Resolve-Base (Get-PythonProbe 'py.exe' @($tag))
            if ($probe -and $probe.supported) { return $probe }
            if ($probe) { $rejected[[string]$probe.executable] = $probe }
        }
    }
    foreach ($command in @(Get-Command 'python.exe' -All -ErrorAction SilentlyContinue)) {
        $probe = Resolve-Base (Get-PythonProbe $command.Path)
        if ($probe -and $probe.supported) { return $probe }
        if ($probe) { $rejected[[string]$probe.executable] = $probe }
    }
    $found = ''
    if ($rejected.Count -gt 0) {
        $found = ' Found only: ' + (($rejected.Values | ForEach-Object { "Python $($_.python) ($($_.bits)-bit) at $($_.executable)" }) -join '; ') + '.'
    }
    throw ("Python 3.10+ x64 was not found.$found Install Python $PythonBaseline x64 from python.org (keep its " +
        "'py launcher' option), or pass -Python <path to python.exe>, then run setup.bat again.")
}

function Get-VenvProblem {
    # Why python\.venv cannot be kept as it is (worded to follow "python\.venv"), or $null.
    if (-not (Test-Path -LiteralPath $VenvDir)) { return 'does not exist yet' }
    if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $VenvDir 'pyvenv.cfg') -PathType Leaf)) {
        return 'is incomplete or was made on another operating system'
    }
    $probe = Get-PythonProbe $VenvPython
    if (-not $probe) { return 'cannot start (the Python it was made from was probably uninstalled or moved)' }
    if (-not $probe.supported) { return "was made with Python $($probe.python) ($($probe.bits)-bit); 3.10+ x64 is required" }
    return $null
}

function Get-VenvHome {
    # The base interpreter's folder recorded in pyvenv.cfg.
    $cfg = Join-Path $VenvDir 'pyvenv.cfg'
    if (-not (Test-Path -LiteralPath $cfg -PathType Leaf)) { return $null }
    foreach ($line in (Get-Content -LiteralPath $cfg)) {
        if ($line -match '^\s*home\s*=\s*(.+?)\s*$') { return $Matches[1] }
    }
    return $null
}

function Get-RequirementLines([string]$Path, [System.Collections.Generic.HashSet[string]]$Seen) {
    # A pip file's requirement lines and those of the files it includes (-r/-c), without the
    # comments and blank lines, so rewording a comment never asks for setup again.
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $Seen.Add($full.ToLowerInvariant())) { return }
    Require-File $full
    $label = $full
    if ($full.StartsWith($ProjectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { $label = $full.Substring($ProjectRoot.Length + 1) }
    '## ' + $label
    foreach ($raw in (Get-Content -LiteralPath $full)) {
        $line = ($raw -replace '(^|\s)#.*$', '').Trim()
        if (-not $line) { continue }
        $line
        if ($line -match '^(-r|--requirement|-c|--constraint)\s*=?\s*(.+)$') {
            Get-RequirementLines (Join-Path (Split-Path -Parent $full) $Matches[2]) $Seen
        }
    }
}

function Get-TextSha256([string]$Text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) } finally { $sha.Dispose() }
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Get-PythonRequirementsFingerprint {
    # What setup installs into python\.venv: requirements, validated constraints, PyInstaller range.
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $lines = @(Get-RequirementLines $PythonRequirements $seen) + @(Get-RequirementLines $PythonConstraints $seen) + @($PyInstallerSpec)
    return (Get-TextSha256 ($lines -join "`n"))
}

function Write-SetupStamp([string]$Path, [hashtable]$Values) {
    $Values['schema'] = 1
    $Values['verifiedUtc'] = [DateTime]::UtcNow.ToString('o')
    ConvertTo-Json -InputObject $Values | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-SetupStampValue([string]$Path, [string]$Name) {
    # One recorded value, or $null when the stamp or the value is missing or unreadable.
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try { $stamp = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json } catch { return $null }
    if (-not $stamp -or -not $stamp.PSObject.Properties[$Name]) { return $null }
    return $stamp.$Name
}

function Get-FileSha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-PythonEnvironmentProblem {
    # File reads only, no interpreter start: why python\.venv is not the environment setup.bat
    # verified for the current requirements, or $null when it is.
    if (-not (Test-Path -LiteralPath $VenvPython -PathType Leaf)) { return 'python\.venv does not exist' }
    $recorded = Get-SetupStampValue $PythonStamp 'requirementsSha256'
    if (-not $recorded) { return 'python\.venv was not verified by setup.bat, or its setup did not finish' }
    if ($recorded -ne (Get-PythonRequirementsFingerprint)) { return 'the Python requirements changed since python\.venv was set up' }
    $base = Get-VenvHome
    if (-not $base -or -not (Test-Path -LiteralPath (Join-Path $base 'python.exe') -PathType Leaf)) {
        return "the Python that python\.venv was made from is gone ($base)"
    }
    return $null
}

function Get-NodeModulesProblem {
    # Why node_modules is not what setup installed from the current package-lock.json, or $null.
    $recorded = Get-SetupStampValue $NodeStamp 'packageLockSha256'
    if (-not $recorded) { return 'node_modules was not installed by setup.bat, or that install did not finish' }
    if ($recorded -ne (Get-FileSha256 $PackageLock)) { return 'package-lock.json changed since node_modules was installed' }
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules\.bin\electron.cmd') -PathType Leaf)) { return 'node_modules has no Electron' }
    return $null
}

function Get-ElectronProgramProblem {
    # Electron 42+ downloads its program the first time it runs, not during npm install. Setup
    # downloads it instead, so a launch never fetches 100+ MB or fails offline. This mirrors the
    # package's own isInstalled() in node_modules\electron\install.js.
    $electron = Join-Path $ProjectRoot 'node_modules\electron'
    $package = Join-Path $electron 'package.json'
    if (-not (Test-Path -LiteralPath $package -PathType Leaf)) { return 'node_modules has no Electron' }
    try {
        $wanted = [string](Get-Content -LiteralPath $package -Raw | ConvertFrom-Json).version
        $have = ([string](Get-Content -LiteralPath (Join-Path $electron 'dist\version') -Raw -ErrorAction Stop)).Trim() -replace '^v', ''
        $program = ([string](Get-Content -LiteralPath (Join-Path $electron 'path.txt') -Raw -ErrorAction Stop)).Trim()
    } catch {
        return 'the Electron program has not been downloaded'
    }
    if ($have -ne $wanted -or -not $program -or -not (Test-Path -LiteralPath (Join-Path $electron ('dist\' + $program)) -PathType Leaf)) {
        return "the Electron $wanted program has not been downloaded"
    }
    return $null
}

function Install-ElectronProgram {
    # node_modules\electron\install.js checks the download against checksums.json from the locked
    # package, and does nothing when the matching program is already there.
    Invoke-Checked 'node.exe' @((Join-Path $ProjectRoot 'node_modules\electron\install.js'))
    $problem = Get-ElectronProgramProblem
    if ($problem) { throw "Downloading Electron did not complete: $problem." }
}

function Assert-DependenciesReady {
    # For launchers and checks: stop before anything starts when setup.bat has to run first.
    param([switch]$PythonOnly)
    $problems = @(Get-PythonEnvironmentProblem)
    if (-not $PythonOnly) { $problems += @(Get-NodeModulesProblem; Get-ElectronProgramProblem) }
    $problems = @($problems | Where-Object { $_ })
    if ($problems.Count -gt 0) {
        throw ('Setup is needed: ' + ($problems -join '; ') + '. Run .\setup.bat (.\setup.bat --simulate without an eye tracker), then try again.')
    }
}

function Install-NodeDependencies {
    # Exactly package-lock.json: npm ci always starts from an empty node_modules. No package's
    # install script runs (supply-chain safety; none is needed on Windows: esbuild's binary comes
    # as an optional dependency, electron-winstaller is only for Squirrel installers). The one
    # download that needs code, Electron's own program, runs next from the locked package.
    Require-File $PackageLock
    Invoke-Checked 'npm.cmd' @('ci', '--ignore-scripts')
    Install-ElectronProgram
    Write-SetupStamp $NodeStamp @{ packageLockSha256 = (Get-FileSha256 $PackageLock); node = [string](& node.exe --version) }
}

function Get-DependencyUsers {
    # Programs running from this checkout's python\.venv or node_modules (the app, its prediction
    # worker, a test run). Setup would fail half-way replacing files they hold open.
    $inside = @(($VenvDir.TrimEnd('\') + '\'), ((Join-Path $ProjectRoot 'node_modules') + '\'))
    $users = @{}
    foreach ($process in (Get-ProjectProcesses)) { $users[[int]$process.ProcessId] = $process }
    foreach ($process in @(Get-CimInstance Win32_Process)) {
        $exe = [string]$process.ExecutablePath
        foreach ($folder in $inside) {
            if ($exe.StartsWith($folder, [StringComparison]::OrdinalIgnoreCase)) { $users[[int]$process.ProcessId] = $process }
        }
    }
    return @($users.Values)
}

# Shared by the installer and the finite frozen-voice CI smoke test.
function Get-KokoroBundleArguments {
    @('--add-data', ((Join-Path $ProjectRoot 'python\assets\kokoro') + ';assets/kokoro'),
      '--hidden-import', 'services.local_voice', '--collect-all', 'kokoro_onnx',
      '--collect-all', 'phonemizer', '--collect-all', 'espeakng_loader',
      '--collect-all', 'sounddevice', '--collect-all', '_sounddevice_data')
}
