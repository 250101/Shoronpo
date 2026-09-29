param(
  [string]$ExpectedProjectRef = 'krpiprwplhxrxlhzcuak'
)

$ErrorActionPreference = 'Stop'
$originalPgPassword = $env:PGPASSWORD
$root = Split-Path -Parent $PSScriptRoot
$seed = Join-Path $root 'supabase\seed\inventory_import.sql'
$psql = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL-17-binaries\pgsql\bin\psql.exe'
$supabaseCli = (Get-Command supabase -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $psql)) { throw 'No se encontro psql.' }
if (-not (Test-Path -LiteralPath $seed)) { throw 'No se encontro el archivo de importacion.' }

try {
  $projects = (& $supabaseCli projects list | Out-String | ConvertFrom-Json).projects
  $linked = @($projects | Where-Object linked)
  if ($linked.Count -ne 1 -or $linked[0].ref -ne $ExpectedProjectRef) {
    throw "Supabase CLI no esta enlazada exclusivamente a produccion ($ExpectedProjectRef)."
  }

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $plan = (& $supabaseCli db dump --linked --dry-run 2>$null | Out-String)
  $planExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($planExitCode -ne 0) { throw 'Supabase CLI no pudo obtener la conexion segura.' }

  $values = @{}
  foreach ($name in @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE')) {
    $match = [regex]::Match($plan, "export $name=`"([^`"]+)`"")
    if (-not $match.Success) { throw "Supabase CLI no devolvio $name." }
    $values[$name] = $match.Groups[1].Value
  }

  $env:PGPASSWORD = $values.PGPASSWORD
  $common = @('--host',$values.PGHOST,'--port',$values.PGPORT,'--username',$values.PGUSER,'--dbname',$values.PGDATABASE,'--no-align','--tuples-only','--set','ON_ERROR_STOP=on')
  $preflightSql = @"
set role postgres;
select
  (select count(*) from public.locations),
  (select count(*) from public.products),
  (select count(*) from public.inventory_periods),
  (select count(*) from public.inventory_lines),
  (select count(*) from public.inventory_reconciliations),
  (select count(*) from public.profiles p where p.is_active),
  (select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id where r.code='ADMINISTRADOR');
"@
  $preflightOutput = & $psql @common --command $preflightSql
  if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion previa.' }
  $preflight = ($preflightOutput | Select-Object -Last 1).Trim()
  $counts = $preflight -split '\|'
  if ($counts.Count -ne 7) { throw "Respuesta previa inesperada: $preflight" }
  if ([int]$counts[0] -ne 0 -or [int]$counts[1] -ne 0 -or [int]$counts[2] -ne 0 -or [int]$counts[3] -ne 0 -or [int]$counts[4] -ne 0) {
    throw "Produccion ya contiene datos operativos; importacion cancelada ($preflight)."
  }
  if ([int]$counts[5] -lt 1 -or [int]$counts[6] -lt 1) {
    throw "No hay un usuario administrador activo; importacion cancelada ($preflight)."
  }

  & $psql @common --file $seed
  if ($LASTEXITCODE -ne 0) { throw 'Fallo la importacion; la transaccion fue revertida.' }

  $verifySql = @"
set role postgres;
select
  (select count(*) from public.locations where code='OBR-TEST' and is_active),
  (select count(*) from public.products where is_active),
  (select count(*) from public.inventory_periods ip join public.locations l on l.id=ip.location_id where l.code='OBR-TEST'),
  (select count(*) from public.inventory_lines il join public.inventory_periods ip on ip.id=il.period_id join public.locations l on l.id=ip.location_id where l.code='OBR-TEST'),
  (select count(*) from public.inventory_reconciliations ir join public.inventory_lines il on il.id=ir.inventory_line_id join public.inventory_periods ip on ip.id=il.period_id join public.locations l on l.id=ip.location_id where l.code='OBR-TEST'),
  (select count(*) from public.user_locations ul join public.locations l on l.id=ul.location_id where l.code='OBR-TEST');
"@
  $verifiedOutput = & $psql @common --command $verifySql
  if ($LASTEXITCODE -ne 0) { throw 'Fallo la verificacion posterior.' }
  $verified = ($verifiedOutput | Select-Object -Last 1).Trim()
  if ($verified -notmatch '^1\|40\|6\|236\|6\|[1-9][0-9]*$') {
    throw "La importacion termino con conteos inesperados: $verified"
  }
  Write-Host "OK: produccion cargada y verificada ($verified)."
}
finally {
  if ($null -eq $originalPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  else { $env:PGPASSWORD = $originalPgPassword }
}
