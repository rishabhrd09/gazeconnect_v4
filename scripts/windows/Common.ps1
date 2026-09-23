# Shared by the Windows entry points. Compatible with Windows PowerShell 5.1.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:VenvPython = Join-Path $ProjectRoot 'python\.venv\Scripts\python.exe'
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
