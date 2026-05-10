param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

$runtimeDir = Join-Path $RepoRoot ".ai\agent-rag\runtime"
$logDir = Join-Path $runtimeDir "logs"
$watchScript = Join-Path $RepoRoot "tools\agent-bridge\scripts\watch-runtime.ps1"
$startScript = Join-Path $RepoRoot "tools\agent-bridge\scripts\start-runtime.ps1"
$ensureLog = Join-Path $logDir "ensure-runtime.log"
$autoStartEnabled = $env:REPORT_RUNTIME_AUTOSTART -eq "1"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-EnsureLog([string]$Message) {
  Add-Content -Path $ensureLog -Value "$(Get-Date -Format o) $Message"
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

function Test-WatchdogRunning {
  $process = Get-CimInstance Win32_Process -Filter "name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -like "*watch-runtime.ps1*" -and
      $_.CommandLine -notlike "*Get-CimInstance*"
    } |
    Select-Object -First 1
  return $null -ne $process
}

if (-not (Test-WatchdogRunning)) {
  if ($autoStartEnabled) {
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        $watchScript,
        "-RepoRoot",
        $RepoRoot
      ) `
      -WorkingDirectory $RepoRoot `
      -WindowStyle Hidden
    Write-EnsureLog "watchdog started"
  } else {
    Write-EnsureLog "watchdog start skipped because REPORT_RUNTIME_AUTOSTART is not enabled"
  }
} else {
  Write-EnsureLog "watchdog already running"
}

if (-not (Test-PortListening 8317) -or -not (Test-LocalBridgeHealthy)) {
  if ($autoStartEnabled) {
    $repairOut = Join-Path $logDir "ensure-repair.out.log"
    $repairErr = Join-Path $logDir "ensure-repair.err.log"
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
    Write-EnsureLog "runtime repair started pid=$($process.Id)"
  } else {
    Write-EnsureLog "runtime unhealthy but autostart is disabled"
  }
} else {
  Write-EnsureLog "runtime already healthy"
}
