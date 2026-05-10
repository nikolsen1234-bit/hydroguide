param(
  [string]$TaskName = "HydroGuide Report Runtime",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
)

$ErrorActionPreference = "Stop"

$ensureScript = Join-Path $RepoRoot "tools\agent-bridge\scripts\ensure-runtime.ps1"
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ensureScript`" -RepoRoot `"$RepoRoot`"" `
  -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Invokes ensure-runtime.ps1 at logon. Actual runtime startup stays disabled unless REPORT_RUNTIME_AUTOSTART=1 is set." `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $TaskName"
} catch {
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $runName = $TaskName -replace "[^A-Za-z0-9 _.-]", ""
  $command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ensureScript`" -RepoRoot `"$RepoRoot`""
  New-Item -Path $runKey -Force | Out-Null
  New-ItemProperty -Path $runKey -Name $runName -Value $command -PropertyType String -Force | Out-Null
  Write-Host "Scheduled task registration failed; installed HKCU Run startup entry: $runName"
}
