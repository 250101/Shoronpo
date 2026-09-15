$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$psql = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL-17-binaries\pgsql\bin\psql.exe'
$migration = Join-Path $root 'supabase\migrations\0014_schedule_stock_sync.sql'

if (-not (Test-Path -LiteralPath $psql)) { throw 'No se encontro psql.' }
if (-not (Test-Path -LiteralPath $migration)) { throw 'No se encontro la migracion de scheduler.' }

$secure = Read-Host 'Pega la contrasena de la base de datos de Supabase' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$bytes = New-Object byte[] 48
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($bytes)
$generator.Dispose()
$trigger = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()

try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

  supabase secrets set SHORONPO_SYNC_TRIGGER_SECRET="$trigger" --project-ref htuearldqvzqohoxwmdp | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar el secreto de Edge Functions.' }

  $escaped = $trigger.Replace("'", "''")
  $vaultSql = @"
do `$$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name='shoronpo_sync_trigger_secret' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret('$escaped', 'shoronpo_sync_trigger_secret');
  else
    perform vault.update_secret(v_id, '$escaped', 'shoronpo_sync_trigger_secret');
  end if;
end;
`$$;
"@
  $vaultSql | & $psql --host 'aws-1-eu-west-1.pooler.supabase.com' --port 5432 --username 'postgres.htuearldqvzqohoxwmdp' --dbname postgres --set ON_ERROR_STOP=on
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar el disparador en Vault.' }

  & $psql --host 'aws-1-eu-west-1.pooler.supabase.com' --port 5432 --username 'postgres.htuearldqvzqohoxwmdp' --dbname postgres --set ON_ERROR_STOP=on --file $migration
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el scheduler.' }

  Write-Host 'OK: sincronizacion de stock programada cada 6 horas.' -ForegroundColor Green
} finally {
  $trigger = $null
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

Read-Host 'Presiona Enter para cerrar'
