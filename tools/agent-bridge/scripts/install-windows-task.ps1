param(
  [string]$TaskName = "HydroGuide Report Agent Bridge",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
)

$ErrorActionPreference = "Stop"

$startScript = Join-Path $RepoRoot "tools\agent-bridge\scripts\start-bridge.ps1"
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -RepoRoot `"$RepoRoot`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs the local HydroGuide report-agent bridge for Cloudflare Tunnel." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $TaskName"
