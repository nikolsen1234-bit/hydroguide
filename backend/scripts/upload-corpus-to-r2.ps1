param(
  [string]$BucketName = "hydroguide-ai-reference",
  [string]$Prefix = "ai-search/nve-search",
  [Parameter(Mandatory=$true)]
  [string]$CorpusPath
)

$resolvedCorpusPath = (Resolve-Path $CorpusPath).Path
$files = Get-ChildItem -Path $resolvedCorpusPath -Recurse -File

if ($files.Count -eq 0) {
  throw "Ingen corpus-filer funne i $resolvedCorpusPath"
}

foreach ($file in $files) {
  $relativePath = $file.FullName.Substring($resolvedCorpusPath.Length).TrimStart('\').Replace('\', '/')
  $objectKey = "$BucketName/$Prefix/$relativePath"

  $contentType = switch ([System.IO.Path]::GetExtension($file.Name).ToLowerInvariant()) {
    ".json" { "application/json; charset=utf-8" }
    ".md" { "text/markdown; charset=utf-8" }
    default { "text/plain; charset=utf-8" }
  }

  Write-Host "Uploading $relativePath"
  npx wrangler r2 object put $objectKey --file $file.FullName --remote --content-type $contentType
  if ($LASTEXITCODE -ne 0) {
    throw "Opplasting feila for $relativePath"
  }
}
