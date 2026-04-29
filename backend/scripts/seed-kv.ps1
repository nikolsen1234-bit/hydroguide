param(
  [switch]$Remote,
  [string]$NamespaceId = "",
  [string]$ConfigPath = (Join-Path $PSScriptRoot "..\\config\\wrangler.jsonc")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

$workerRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$seedPath = Join-Path $workerRoot "data\\cloudflare-kv\\kv-seed.json"

if (-not (Test-Path -LiteralPath $seedPath)) {
  throw "Could not find seed file at $seedPath"
}

$seed = Get-Content -LiteralPath $seedPath -Raw | ConvertFrom-Json
$tempDir = Join-Path $env:TEMP ("hydroguide-kv-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  foreach ($property in $seed.PSObject.Properties) {
    $key = $property.Name
    $value = $property.Value
    $tempFile = Join-Path $tempDir ([Guid]::NewGuid().ToString("N") + ".txt")

    if ($value -is [string]) {
      $content = $value
    } else {
      $content = $value | ConvertTo-Json -Depth 50
    }

    Write-Utf8NoBom -Path $tempFile -Content $content

    $args = @("wrangler", "kv", "key", "put", $key, "--path", $tempFile)
    if ($NamespaceId) {
      $args += @("--namespace-id", $NamespaceId)
    } else {
      $resolvedConfig = (Resolve-Path $ConfigPath).Path
      $args += @("--config", $resolvedConfig, "--binding", "PROMPT_KV")
    }

    if ($Remote) {
      $args += "--remote"
    } else {
      $args += "--local"
    }

    Write-Host "Seeding $key"
    & npx.cmd @args
    if ($LASTEXITCODE -ne 0) {
      throw "wrangler kv key put failed for $key"
    }
  }
} finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}

Write-Host "Finished seeding KV."
