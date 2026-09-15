[CmdletBinding()]
param(
  [string]$BackupRoot = (Join-Path $env:USERPROFILE 'Documents\Shoronpo-Backups'),
  [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$projectRef = 'htuearldqvzqohoxwmdp'

function Resolve-PostgresTool([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $portable = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL-17-binaries\pgsql\bin\$Name.exe"
  if (Test-Path -LiteralPath $portable) { return $portable }

  throw "Falta '$Name'. Instala las herramientas de linea de comandos de PostgreSQL 17."
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

$pgDump = Resolve-PostgresTool 'pg_dump'
$pgDumpAll = Resolve-PostgresTool 'pg_dumpall'

if ($PreflightOnly) {
  Write-Host "OK: herramientas PostgreSQL disponibles ($(& $pgDump --version))."
  exit 0
}

$dbUrl = $env:SHORONPO_DB_URL
try {
  if ([string]::IsNullOrWhiteSpace($dbUrl)) {
    throw 'Defini SHORONPO_DB_URL solo para esta sesion con la cadena de conexion copiada desde Supabase > Connect. No la guardes en archivos ni en Git.'
  }
  if ($dbUrl -notmatch [regex]::Escape($projectRef)) {
    throw "La conexion no pertenece al proyecto esperado ($projectRef). Backup cancelado."
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $destination = Join-Path $BackupRoot $stamp
  New-Item -ItemType Directory -Path $destination -Force | Out-Null

  & $pgDumpAll --dbname=$dbUrl --roles-only --no-role-passwords --file (Join-Path $destination 'roles.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de roles.' }

  & $pgDump --dbname=$dbUrl --schema-only --no-owner --no-privileges --file (Join-Path $destination 'schema.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump del esquema.' }

  & $pgDump --dbname=$dbUrl --data-only --no-owner --no-privileges --file (Join-Path $destination 'data.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de datos.' }

  $files = Get-ChildItem -LiteralPath $destination -File
  if ($files.Count -ne 3 -or ($files | Where-Object Length -eq 0)) {
    throw 'El backup quedo incompleto o contiene archivos vacios.'
  }

  $manifest = [ordered]@{
    project_ref = $projectRef
    created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    tool_version = (& $pgDump --version | Select-Object -First 1)
    files = @($files | Sort-Object Name | ForEach-Object {
      [ordered]@{
        name = $_.Name
        bytes = $_.Length
        sha256 = Get-Sha256 $_.FullName
      }
    })
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding utf8
  Write-Host "Backup verificado: $destination"
  Write-Host 'Copialo ahora a un segundo medio cifrado. No lo subas al repositorio.'
}
finally {
  Remove-Item Env:SHORONPO_DB_URL -ErrorAction SilentlyContinue
  $dbUrl = $null
}
