[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$ExpectedProjectRef,
  [ValidateSet('staging', 'production')]
  [string]$ExpectedEnvironment
)

$ErrorActionPreference = 'Stop'

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

$resolved = [IO.Path]::GetFullPath($BackupPath)
$manifestPath = Join-Path $resolved 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Falta manifest.json.' }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.format_version -ne 1) { throw 'Version de backup no soportada.' }
if ($ExpectedProjectRef -and $manifest.project_ref -ne $ExpectedProjectRef) { throw 'El backup pertenece a otro proyecto.' }
if ($ExpectedEnvironment -and $manifest.environment -ne $ExpectedEnvironment) { throw 'El backup pertenece a otro entorno.' }
$expectedNames = @('auth_data.sql', 'data.sql', 'schema.sql')
$manifestNames = @($manifest.files | ForEach-Object name | Sort-Object)
if (Compare-Object $expectedNames $manifestNames) { throw 'La lista de archivos del manifiesto no coincide.' }
foreach ($entry in $manifest.files) {
  $path = Join-Path $resolved $entry.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Falta $($entry.name)." }
  $file = Get-Item -LiteralPath $path
  if ($file.Length -ne $entry.bytes -or $file.Length -eq 0) { throw "Tamano invalido: $($entry.name)." }
  $hash = Get-Sha256 $path
  if ($hash -ne $entry.sha256) { throw "Hash invalido: $($entry.name)." }
}
Write-Host "OK: backup integro ($($manifest.environment), $($manifest.project_ref), $($manifest.created_at_utc))."
