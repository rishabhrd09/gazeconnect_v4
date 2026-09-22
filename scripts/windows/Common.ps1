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
    $windowsVersion = [version]((Get-CimInstance Win32_OperatingSystem).Version)
    if ($windowsVersion -lt [version]'10.0') {
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
    for ($port = $Preferred; $port -le $Last; $port++) {
        if (@(Get-PortListeners $port).Count -eq 0) { return $port }
    }
    throw "No free port between $Preferred and $Last. $Preferred is held by: $(Get-PortOwnerText $Preferred)"
}
