[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,
  [ValidateSet('staging', 'production')]
  [string]$Environment = 'production',
  [string]$BackupRoot = (Join-Path $env:USERPROFILE 'Documents\Shoronpo-Backups'),
  [switch]$UseSupabaseCli,
  [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$partialDestination = $null
$originalPgPassword = $env:PGPASSWORD

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
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

function Parse-PostgresUrl([string]$Value) {
  $match = [regex]::Match($Value, '^(?<scheme>postgres|postgresql)://(?<userinfo>[^@/]+)@(?<host>[^/:?#]+)(?::(?<port>[0-9]+))?/(?<database>[^/?#]+)(?:[?].*)?$', 'IgnoreCase')
  if (-not $match.Success) {
    throw 'SHORONPO_DB_URL debe usar postgres:// o postgresql://.'
  }
  $userInfo = $match.Groups['userinfo'].Value
  $separator = $userInfo.IndexOf(':')
  if ($separator -lt 1) { throw 'La conexion debe incluir usuario y contrasena.' }
  $username = [Uri]::UnescapeDataString($userInfo.Substring(0, $separator))
  $password = [Uri]::UnescapeDataString($userInfo.Substring($separator + 1))
  $database = [Uri]::UnescapeDataString($match.Groups['database'].Value)
  if ([string]::IsNullOrWhiteSpace($database)) { throw 'La conexion debe indicar la base de datos.' }
  $hostName = $match.Groups['host'].Value
  if ($hostName -notmatch [regex]::Escape($ProjectRef) -and $username -notmatch [regex]::Escape($ProjectRef)) {
    throw "La conexion no pertenece al proyecto esperado ($ProjectRef). Backup cancelado."
  }
  [ordered]@{
    Host = $hostName
    Port = if ($match.Groups['port'].Success) { [int]$match.Groups['port'].Value } else { 5432 }
    Username = $username
    Password = $password
    Database = $database
  }
}

$pgDump = $null
$supabaseCli = $null
if ($UseSupabaseCli) {
  $command = Get-Command supabase -ErrorAction SilentlyContinue
  if (-not $command) { throw "Falta 'supabase'. Instala Supabase CLI y autenticala." }
  $supabaseCli = $command.Source
  $pgDump = Resolve-PostgresTool 'pg_dump'
}
else { $pgDump = Resolve-PostgresTool 'pg_dump' }
if ($PreflightOnly) {
  if ($UseSupabaseCli) {
    $projects = (& $supabaseCli projects list | Out-String | ConvertFrom-Json).projects
    $linked = @($projects | Where-Object linked)
    if ($linked.Count -ne 1 -or $linked[0].ref -ne $ProjectRef) {
      throw "Supabase CLI no esta enlazada exclusivamente al proyecto esperado ($ProjectRef)."
    }
    Write-Host "OK: Supabase CLI disponible, enlazada a $ProjectRef y $(& $pgDump --version)."
  }
  else { Write-Host "OK: herramientas PostgreSQL disponibles ($(& $pgDump --version))." }
  exit 0
}

try {
  $resolvedRoot = [IO.Path]::GetFullPath($BackupRoot)
  New-Item -ItemType Directory -Path $resolvedRoot -Force | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $finalDestination = Join-Path $resolvedRoot "$Environment-$ProjectRef-$stamp"
  $partialDestination = Join-Path $resolvedRoot ".partial-$Environment-$stamp-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $partialDestination | Out-Null
  if ($UseSupabaseCli) {
    $projects = (& $supabaseCli projects list | Out-String | ConvertFrom-Json).projects
    $linked = @($projects | Where-Object linked)
    if ($linked.Count -ne 1 -or $linked[0].ref -ne $ProjectRef) {
      throw "Supabase CLI no esta enlazada exclusivamente al proyecto esperado ($ProjectRef)."
    }
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $plan = (& $supabaseCli db dump --linked --dry-run 2>$null | Out-String)
    $planExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($planExitCode -ne 0) { throw 'Supabase CLI no pudo crear el plan de conexion.' }
    $values = @{}
    foreach ($name in @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')) {
      $match = [regex]::Match($plan, "export $name=`"([^`"]+)`"")
      if (-not $match.Success) { throw "Supabase CLI no devolvio $name en el plan de conexion." }
      $values[$name] = $match.Groups[1].Value
    }
    $env:PGPASSWORD = $values.PGPASSWORD
    $common = @('--host', $values.PGHOST, '--port', $values.PGPORT, '--username', $values.PGUSER, '--role', 'postgres')
    & $pgDump @common --dbname $values.PGDATABASE --schema public --schema-only --no-owner --no-privileges --no-subscriptions --file (Join-Path $partialDestination 'schema.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump del esquema.' }
    & $pgDump @common --dbname $values.PGDATABASE --schema auth --data-only --no-owner --no-privileges --file (Join-Path $partialDestination 'auth_data.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de Auth.' }
    & $pgDump @common --dbname $values.PGDATABASE --schema public --data-only --no-owner --no-privileges --file (Join-Path $partialDestination 'data.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de datos.' }
    $toolVersion = "supabase $(& $supabaseCli --version | Select-Object -First 1); $(& $pgDump --version | Select-Object -First 1)"
  }
  else {
    $dbUrl = $env:SHORONPO_DB_URL
    if ([string]::IsNullOrWhiteSpace($dbUrl)) {
      throw 'Defini SHORONPO_DB_URL solo para esta sesion con la cadena copiada desde Supabase > Connect.'
    }
    $connection = Parse-PostgresUrl $dbUrl
    $env:PGPASSWORD = $connection.Password
    $common = @('--host', $connection.Host, '--port', [string]$connection.Port, '--username', $connection.Username)
    & $pgDump @common --dbname $connection.Database --schema public --schema-only --no-owner --no-privileges --no-subscriptions --file (Join-Path $partialDestination 'schema.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump del esquema.' }
    & $pgDump @common --dbname $connection.Database --schema auth --data-only --no-owner --no-privileges --file (Join-Path $partialDestination 'auth_data.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de Auth.' }
    & $pgDump @common --dbname $connection.Database --schema public --data-only --no-owner --no-privileges --file (Join-Path $partialDestination 'data.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el dump de datos.' }
    $toolVersion = (& $pgDump --version | Select-Object -First 1)
  }

  $files = Get-ChildItem -LiteralPath $partialDestination -File
  if ($files.Count -ne 3 -or ($files | Where-Object Length -eq 0)) { throw 'El backup quedo incompleto o contiene archivos vacios.' }
  $manifest = [ordered]@{
    format_version = 1
    project_ref = $ProjectRef
    environment = $Environment
    created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    tool_version = $toolVersion
    files = @($files | Sort-Object Name | ForEach-Object {
      [ordered]@{ name = $_.Name; bytes = $_.Length; sha256 = Get-Sha256 $_.FullName }
    })
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $partialDestination 'manifest.json') -Encoding utf8
  Move-Item -LiteralPath $partialDestination -Destination $finalDestination
  $partialDestination = $null
  Write-Host "Backup verificado: $finalDestination"
  Write-Host 'Copialo ahora a un segundo medio cifrado. No lo subas al repositorio.'
}
finally {
  if ($partialDestination -and (Test-Path -LiteralPath $partialDestination)) {
    Remove-Item -LiteralPath $partialDestination -Recurse -Force
  }
  if ($null -eq $originalPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  else { $env:PGPASSWORD = $originalPgPassword }
  Remove-Item Env:SHORONPO_DB_URL -ErrorAction SilentlyContinue
}
