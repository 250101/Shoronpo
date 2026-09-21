[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupPath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]{20}$')][string]$SourceProjectRef,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]{20}$')][string]$TargetProjectRef,
  [ValidateSet('staging', 'production')][string]$SourceEnvironment = 'production'
)

$ErrorActionPreference = 'Stop'
$originalPgPassword = $env:PGPASSWORD

function Resolve-PostgresTool([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $portable = Join-Path $env:LOCALAPPDATA "Programs\PostgreSQL-17-binaries\pgsql\bin\$Name.exe"
  if (Test-Path -LiteralPath $portable) { return $portable }
  throw "Falta '$Name'. Instala las herramientas de PostgreSQL 17."
}

function Parse-PostgresUrl([string]$Value) {
  try { $uri = [Uri]$Value } catch { throw 'SHORONPO_RESTORE_DB_URL no es valida.' }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw 'La conexion de destino debe ser PostgreSQL.' }
  $separator = $uri.UserInfo.IndexOf(':')
  if ($separator -lt 1) { throw 'La conexion de destino debe incluir usuario y contrasena.' }
  $username = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $separator))
  if ($uri.Host -notmatch [regex]::Escape($TargetProjectRef) -and $username -notmatch [regex]::Escape($TargetProjectRef)) {
    throw "La conexion no pertenece al destino declarado ($TargetProjectRef)."
  }
  [ordered]@{
    Host = $uri.Host
    Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
    Username = $username
    Password = [Uri]::UnescapeDataString($uri.UserInfo.Substring($separator + 1))
    Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  }
}

if ($SourceProjectRef -eq $TargetProjectRef) { throw 'Restauracion cancelada: origen y destino no pueden ser el mismo proyecto.' }
$targetUrl = $env:SHORONPO_RESTORE_DB_URL
if ([string]::IsNullOrWhiteSpace($targetUrl)) { throw 'Defini SHORONPO_RESTORE_DB_URL solo para esta sesion con la conexion del proyecto temporal.' }
$connection = Parse-PostgresUrl $targetUrl
$psql = Resolve-PostgresTool 'psql'
$verify = Join-Path $PSScriptRoot 'verify_backup.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $verify -BackupPath $BackupPath -ExpectedProjectRef $SourceProjectRef -ExpectedEnvironment $SourceEnvironment | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'El backup no supero la verificacion de integridad.' }

try {
  $env:PGPASSWORD = $connection.Password
  $common = @('--host', $connection.Host, '--port', [string]$connection.Port, '--username', $connection.Username, '--dbname', $connection.Database)
  $existing = & $psql @common --tuples-only --no-align --variable ON_ERROR_STOP=1 --command "select count(*) from pg_tables where schemaname = 'public';"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar el proyecto temporal.' }
  if (($existing | Select-Object -Last 1).Trim() -ne '0') { throw 'El destino no esta vacio. Restauracion cancelada.' }

  $resolved = [IO.Path]::GetFullPath($BackupPath)
  & $psql @common --single-transaction --variable ON_ERROR_STOP=1 `
    --file (Join-Path $resolved 'schema.sql') `
    --command 'SET session_replication_role = replica' `
    --file (Join-Path $resolved 'auth_data.sql') `
    --file (Join-Path $resolved 'data.sql')
  if ($LASTEXITCODE -ne 0) { throw 'La restauracion fallo y fue revertida.' }

  $summary = & $psql @common --tuples-only --no-align --variable ON_ERROR_STOP=1 --command "select count(*) || ' tablas; ' || coalesce(sum(case when relrowsecurity then 0 else 1 end),0) || ' sin RLS' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"
  if ($LASTEXITCODE -ne 0) { throw 'La restauracion termino pero fallo su validacion.' }
  Write-Host "OK: restauracion aislada completada en $TargetProjectRef ($($summary | Select-Object -Last 1))."
}
finally {
  if ($null -eq $originalPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  else { $env:PGPASSWORD = $originalPgPassword }
  Remove-Item Env:SHORONPO_RESTORE_DB_URL -ErrorAction SilentlyContinue
}
