[CmdletBinding()]
param(
  [string]$BackupRoot = (Join-Path $env:USERPROFILE 'Documents\Shoronpo-Backups'),
  [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$projectRef = 'htuearldqvzqohoxwmdp'

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Falta '$Name'. $InstallHint"
  }
}

Require-Command 'docker' 'Instala Docker Desktop y comproba que este iniciado.'
Require-Command 'supabase' 'Instala la CLI oficial de Supabase y volve a ejecutar el script.'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker esta instalado pero el motor no esta iniciado.'
}

if ($PreflightOnly) {
  Write-Host 'OK: Docker y Supabase CLI estan disponibles.'
  exit 0
}

$dbUrl = $env:SHORONPO_DB_URL
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
  throw 'Defini SHORONPO_DB_URL solo para esta sesion con la cadena de conexion copiada desde Supabase > Connect. No la guardes en archivos ni en Git.'
}
if ($dbUrl -notmatch [regex]::Escape($projectRef)) {
  throw "La conexion no pertenece al proyecto esperado ($projectRef). Backup cancelado."
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $destination -Force | Out-Null

try {
  & supabase db dump --db-url $dbUrl --file (Join-Path $destination 'roles.sql') --role-only
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de roles.' }

  & supabase db dump --db-url $dbUrl --file (Join-Path $destination 'schema.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump del esquema.' }

  & supabase db dump --db-url $dbUrl --file (Join-Path $destination 'data.sql') --data-only --use-copy
  if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de datos.' }

  $files = Get-ChildItem -LiteralPath $destination -File
  if ($files.Count -ne 3 -or ($files | Where-Object Length -eq 0)) {
    throw 'El backup quedo incompleto o contiene archivos vacios.'
  }

  $manifest = [ordered]@{
    project_ref = $projectRef
    created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    tool_version = (& supabase --version | Select-Object -First 1)
    files = @($files | Sort-Object Name | ForEach-Object {
      [ordered]@{
        name = $_.Name
        bytes = $_.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
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
