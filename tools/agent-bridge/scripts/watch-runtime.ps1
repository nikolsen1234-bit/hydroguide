param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [int]$IntervalSeconds = 15
)

$ErrorActionPreference = "Continue"
Set-Location $RepoRoot

$runtimeDir = Join-Path $RepoRoot ".ai\agent-rag\runtime"
$logDir = Join-Path $runtimeDir "logs"
$startScript = Join-Path $RepoRoot "tools\agent-bridge\scripts\start-runtime.ps1"
$bridgeUrlPath = Join-Path $runtimeDir "bridge-url.txt"
$watchLog = Join-Path $logDir "watchdog.log"
$lockPath = Join-Path $runtimeDir "watch-runtime.lock"
$lastRepairUtc = [DateTime]::MinValue
$autoRepairEnabled = $env:REPORT_RUNTIME_AUTOREPAIR -eq "1"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-WatchLog([string]$Message) {
  Add-Content -Path $watchLog -Value "$(Get-Date -Format o) $Message"
}

function Test-PortListening([int]$Port) {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  return $null -ne $connection
}

function Test-LocalBridgeHealthy {
  if (-not (Test-PortListening 8788)) {
    return $false
  }

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8788/health" -TimeoutSec 5
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

function Test-CloudflaredForBridge {
  $process = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "127\.0\.0\.1:8788" -or $_.CommandLine -match "hydroguide-report-bridge" } |
    Select-Object -First 1
  return $null -ne $process
}

function Get-BridgeUrl {
  if (-not (Test-Path $bridgeUrlPath)) {
    return ""
  }
  return (Get-Content $bridgeUrlPath -Raw).Trim()
}

function Test-RemoteBridgeHealthy([string]$BridgeUrl) {
  if (-not $BridgeUrl -or $BridgeUrl -notmatch "^https://") {
    return $false
  }

  try {
    $response = Invoke-RestMethod -Uri ($BridgeUrl.TrimEnd("/") + "/health") -TimeoutSec 10
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

function Invoke-RuntimeRepair([string]$Reason) {
  Write-WatchLog "repair requested: $Reason"

  $repairOut = Join-Path $logDir "runtime-repair.out.log"
  $repairErr = Join-Path $logDir "runtime-repair.err.log"
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $startScript,
      "-RepoRoot",
      $RepoRoot
    ) `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $repairOut `
    -RedirectStandardError $repairErr `
    -PassThru

  Write-WatchLog "repair spawned: pid=$($process.Id)"
  Start-Sleep -Seconds 20
}

try {
  $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  Write-WatchLog "another watchdog is already running"
  exit 0
}

Write-WatchLog "watchdog started repoRoot=$RepoRoot intervalSeconds=$IntervalSeconds"
Write-WatchLog "autoRepairEnabled=$autoRepairEnabled"

try {
  while ($true) {
    try {
      $failures = @()
      if (-not (Test-PortListening 8317)) {
        $failures += "cliproxy-port"
      }
      if (-not (Test-LocalBridgeHealthy)) {
        $failures += "local-bridge"
      }

      $bridgeUrl = Get-BridgeUrl
      if (-not (Test-CloudflaredForBridge)) {
        $failures += "cloudflared-process"
      } elseif (-not (Test-RemoteBridgeHealthy $bridgeUrl)) {
        $failures += "cloudflared-health"
      }

      if ($failures.Count -gt 0) {
        if (-not $autoRepairEnabled) {
          Write-WatchLog "issues detected without repair: $($failures -join ",")"
          Start-Sleep -Seconds $IntervalSeconds
          continue
        }
        $nowUtc = (Get-Date).ToUniversalTime()
        if (($nowUtc - $lastRepairUtc).TotalSeconds -lt 60) {
          Write-WatchLog "repair suppressed: $($failures -join ",")"
        } else {
          $lastRepairUtc = $nowUtc
          Invoke-RuntimeRepair ($failures -join ",")
        }
      }
    } catch {
      Write-WatchLog "watchdog loop error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $IntervalSeconds
  }
} finally {
  if ($lockStream) {
    $lockStream.Dispose()
  }
}
