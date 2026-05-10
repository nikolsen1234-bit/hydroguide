param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path,
  [switch]$DeployWorker,
  [switch]$AllowQuickTunnel,
  [switch]$Watch
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

$runtimeDir = Join-Path $RepoRoot ".ai\agent-rag\runtime"
$logDir = Join-Path $runtimeDir "logs"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Import-LocalSecrets {
  $secretsPath = Join-Path $RepoRoot ".secrets"
  if (-not (Test-Path $secretsPath)) {
    return
  }

  Get-Content $secretsPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $separator = $line.IndexOf("=")
    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
    if ($name) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Test-PortListening([int]$Port) {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  return $null -ne $connection
}

function Get-ListenerProcessId([int]$Port) {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($connection) {
    return [int]$connection.OwningProcess
  }
  return $null
}

function Test-ReportBridgeHealthy {
  if (-not (Test-PortListening 8788)) {
    return $false
  }
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8788/health" -TimeoutSec 5
    return $response.ok -eq $true
  } catch {
    $pid = Get-ListenerProcessId 8788
    if ($pid) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    return $false
  }
}

function Stop-ExistingCloudflared {
  Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -match "127\.0\.0\.1:8788" -or
      $_.CommandLine -match "hydroguide-report-bridge" -or
      $_.CommandLine -match "tunnel run"
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Test-CloudflaredForBridge {
  $process = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "127\.0\.0\.1:8788" -or $_.CommandLine -match "hydroguide-report-bridge" } |
    Select-Object -First 1
  return $null -ne $process
}

function Test-BridgeUrl([string]$BridgeUrl) {
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

function Start-CliProxyApi {
  if (Test-PortListening 8317) {
    return
  }

  $exe = Join-Path $env:USERPROFILE ".local\cliproxyapi\v6.10.9\extracted\cli-proxy-api.exe"
  $config = Join-Path $env:USERPROFILE ".cli-proxy-api\config.yaml"
  if (-not (Test-Path $exe)) {
    throw "CLIProxyAPI executable not found: $exe"
  }
  if (-not (Test-Path $config)) {
    throw "CLIProxyAPI config not found: $config"
  }

  Start-Process -FilePath $exe `
    -ArgumentList @("-config", $config) `
    -WorkingDirectory (Split-Path $config -Parent) `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "cliproxy.out.log") `
    -RedirectStandardError (Join-Path $logDir "cliproxy.err.log")

  for ($i = 0; $i -lt 30; $i++) {
    if (Test-PortListening 8317) {
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "CLIProxyAPI did not start on 127.0.0.1:8317."
}

function Start-ReportBridge {
  if (Test-ReportBridgeHealthy) {
    return
  }

  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "tools\agent-bridge\scripts\start-bridge.ps1",
      "-RepoRoot",
      $RepoRoot
    ) `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "bridge.out.log") `
    -RedirectStandardError (Join-Path $logDir "bridge.err.log")

  for ($i = 0; $i -lt 30; $i++) {
    if (Test-PortListening 8788) {
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Report bridge did not start on 127.0.0.1:8788."
}

function Start-QuickTunnel {
  Stop-ExistingCloudflared
  $out = Join-Path $logDir "cloudflared.out.log"
  $err = Join-Path $logDir "cloudflared.err.log"
  Remove-Item -LiteralPath $out, $err -ErrorAction SilentlyContinue

  Start-Process -FilePath "cloudflared.exe" `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:8788", "--loglevel", "info") `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $out `
    -RedirectStandardError $err

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $text = ""
    if (Test-Path $out) {
      $text += Get-Content $out -Raw
    }
    if (Test-Path $err) {
      $text += Get-Content $err -Raw
    }
    $match = [regex]::Match($text, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      return $match.Value
    }
  }

  throw "cloudflared quick tunnel did not produce a URL."
}

function Write-RuntimeWorkerConfig([string]$BridgeUrl) {
  $sourceConfigPath = Join-Path $RepoRoot "backend\cloudflare\report.generated.wrangler.jsonc"
  if (-not (Test-Path $sourceConfigPath)) {
    throw "Report Worker generated config not found: $sourceConfigPath"
  }

  $config = Get-Content $sourceConfigPath -Raw | ConvertFrom-Json
  $config.main = (Join-Path $RepoRoot "backend\workers\report\index.js").Replace("\", "/")
  $config.vars.REPORT_BRIDGE_URL = $BridgeUrl
  $runtimeConfigPath = Join-Path $runtimeDir "report.runtime.wrangler.jsonc"
  $config | ConvertTo-Json -Depth 20 | Set-Content -Path $runtimeConfigPath -Encoding UTF8
  return $runtimeConfigPath
}

function Deploy-ReportWorker([string]$BridgeUrl) {
  $wrangler = Join-Path $RepoRoot "frontend\node_modules\.bin\wrangler.cmd"
  if (-not (Test-Path $wrangler)) {
    throw "Wrangler not found: $wrangler"
  }

  $configPath = Write-RuntimeWorkerConfig $BridgeUrl
  & $wrangler deploy --config $configPath
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler deploy failed."
  }
}

function Start-ReportRuntimeOnce {
  Import-LocalSecrets
  Start-CliProxyApi
  Start-ReportBridge

  $bridgeUrlPath = Join-Path $runtimeDir "bridge-url.txt"
  $existingBridgeUrl = if (Test-Path $bridgeUrlPath) {
    (Get-Content $bridgeUrlPath -Raw).Trim()
  } else {
    ""
  }

  $bridgeUrl = if ($env:REPORT_BRIDGE_URL -and $env:REPORT_BRIDGE_URL -match "^https://") {
    $env:REPORT_BRIDGE_URL.TrimEnd("/")
  } elseif ((Test-ReportBridgeHealthy) -and (Test-CloudflaredForBridge) -and (Test-BridgeUrl $existingBridgeUrl)) {
    $existingBridgeUrl
  } elseif ($AllowQuickTunnel) {
    Start-QuickTunnel
  } else {
    ""
  }

  if ($bridgeUrl) {
    Set-Content -Path $bridgeUrlPath -Value $bridgeUrl -Encoding UTF8
  }

  if ($DeployWorker) {
    if (-not $bridgeUrl) {
      throw "Cannot deploy report worker without REPORT_BRIDGE_URL or -AllowQuickTunnel."
    }
  }

  if ($DeployWorker -and $bridgeUrl -ne $existingBridgeUrl) {
    Deploy-ReportWorker $bridgeUrl
  }

  if ($bridgeUrl) {
    Write-Host "HydroGuide report runtime ready: $bridgeUrl"
  } else {
    Write-Host "HydroGuide report runtime ready locally on 127.0.0.1:8788. No public tunnel started."
  }
}

if ($Watch) {
  while ($true) {
    try {
      Start-ReportRuntimeOnce
    } catch {
      $message = $_.Exception.Message
      Add-Content -Path (Join-Path $logDir "runtime-watch.err.log") -Value "$(Get-Date -Format o) $message"
    }
    Start-Sleep -Seconds 60
  }
} else {
  Start-ReportRuntimeOnce
}
