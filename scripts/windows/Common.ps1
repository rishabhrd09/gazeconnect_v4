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
