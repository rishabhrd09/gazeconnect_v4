param(
    [int]$DurationMinutes = 30,
    [int]$IntervalSeconds = 30,
    [string]$OutputDir = "tools\reports",
    [string]$SurveyDir = "survey_data",
    [string]$ChatDir = "chat_history",
    [string]$DataDir = "data",
    [string[]]$ProcessNames = @("electron", "python", "TobiiGazeHelper")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DirMetrics {
    param([string]$PathValue)
    if (-not (Test-Path $PathValue)) {
        return [pscustomobject]@{
            files = 0
            bytes = 0
        }
    }
    $files = Get-ChildItem -Recurse -File $PathValue -ErrorAction SilentlyContinue
    $sum = ($files | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { $sum = 0 }
    return [pscustomobject]@{
        files = @($files).Count
        bytes = [int64]$sum
    }
}

function BytesHuman {
    param([int64]$Value)
    $units = @("B", "KB", "MB", "GB", "TB")
    $v = [double]$Value
    $i = 0
    while ($v -ge 1024 -and $i -lt ($units.Length - 1)) {
        $v = $v / 1024
        $i++
    }
    return ("{0:N2} {1}" -f $v, $units[$i])
}

$start = Get-Date
$end = $start.AddMinutes($DurationMinutes)
$runId = $start.ToString("yyyyMMdd_HHmmss")

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$csvPath = Join-Path $OutputDir "soak_metrics_$runId.csv"
$summaryPath = Join-Path $OutputDir "soak_summary_$runId.txt"

$rows = New-Object System.Collections.Generic.List[object]

Write-Host "Soak monitor started: $start"
Write-Host "Duration: $DurationMinutes minute(s), interval: $IntervalSeconds second(s)"
Write-Host "CSV: $csvPath"

while ((Get-Date) -lt $end) {
    $ts = Get-Date

    $survey = Get-DirMetrics -PathValue $SurveyDir
    $chat = Get-DirMetrics -PathValue $ChatDir
    $data = Get-DirMetrics -PathValue $DataDir

    $procList = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $ProcessNames -contains $_.ProcessName })
    $procCount = $procList.Count
    $workingSetBytes = [int64]0
    $privateBytes = [int64]0
    if ($procCount -gt 0) {
        $workingMeasure = $procList | Measure-Object -Property WorkingSet64 -Sum
        $privateMeasure = $procList | Measure-Object -Property PrivateMemorySize64 -Sum
        if ($workingMeasure.PSObject.Properties.Name -contains "Sum" -and $null -ne $workingMeasure.Sum) {
            $workingSetBytes = [int64]$workingMeasure.Sum
        }
        if ($privateMeasure.PSObject.Properties.Name -contains "Sum" -and $null -ne $privateMeasure.Sum) {
            $privateBytes = [int64]$privateMeasure.Sum
        }
    }

    $row = [pscustomobject]@{
        timestamp = $ts.ToString("o")
        survey_files = $survey.files
        survey_bytes = $survey.bytes
        chat_files = $chat.files
        chat_bytes = $chat.bytes
        data_files = $data.files
        data_bytes = $data.bytes
        tracked_process_count = $procCount
        tracked_working_set_bytes = $workingSetBytes
        tracked_private_bytes = $privateBytes
    }
    $rows.Add($row) | Out-Null

    Start-Sleep -Seconds $IntervalSeconds
}

$rows | Export-Csv -NoTypeInformation -Path $csvPath -Encoding UTF8

$first = $rows[0]
$last = $rows[$rows.Count - 1]

$summary = @()
$summary += "Soak monitor summary"
$summary += "Run ID: $runId"
$summary += "Start: $start"
$summary += "End: $(Get-Date)"
$summary += "Samples: $($rows.Count)"
$summary += ""
$summary += "Storage deltas:"
$summary += "survey_data: $([int64]$first.survey_bytes) -> $([int64]$last.survey_bytes) (delta: $([int64]$last.survey_bytes - [int64]$first.survey_bytes) bytes)"
$summary += "chat_history: $([int64]$first.chat_bytes) -> $([int64]$last.chat_bytes) (delta: $([int64]$last.chat_bytes - [int64]$first.chat_bytes) bytes)"
$summary += "data: $([int64]$first.data_bytes) -> $([int64]$last.data_bytes) (delta: $([int64]$last.data_bytes - [int64]$first.data_bytes) bytes)"
$summary += ""
$summary += "Process memory (tracked names: $($ProcessNames -join ', ')):"
$summary += "working set: $([int64]$first.tracked_working_set_bytes) -> $([int64]$last.tracked_working_set_bytes)"
$summary += "private bytes: $([int64]$first.tracked_private_bytes) -> $([int64]$last.tracked_private_bytes)"
$summary += ""
$summary += "Human-readable end sizes:"
$summary += "survey_data: $(BytesHuman -Value ([int64]$last.survey_bytes))"
$summary += "chat_history: $(BytesHuman -Value ([int64]$last.chat_bytes))"
$summary += "data: $(BytesHuman -Value ([int64]$last.data_bytes))"
$summary += "tracked working set: $(BytesHuman -Value ([int64]$last.tracked_working_set_bytes))"
$summary += "tracked private bytes: $(BytesHuman -Value ([int64]$last.tracked_private_bytes))"

$summary | Set-Content -Path $summaryPath -Encoding UTF8

Write-Host ""
Write-Host "Soak monitor complete."
Write-Host "Summary: $summaryPath"
Write-Host "CSV: $csvPath"
