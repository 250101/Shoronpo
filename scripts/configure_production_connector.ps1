param(
  [string]$ProjectRef = 'krpiprwplhxrxlhzcuak'
)

$ErrorActionPreference = 'Stop'
$originalPgPassword = $env:PGPASSWORD
$psql = Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL-17-binaries\pgsql\bin\psql.exe'
$supabaseCli = (Get-Command supabase -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $psql)) { throw 'No se encontro psql.' }

$bytes = New-Object byte[] 48
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($bytes)
$generator.Dispose()
$trigger = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()

try {
  $secrets = & $supabaseCli secrets list --project-ref $ProjectRef --output json | Out-String | ConvertFrom-Json
  if ('TSPOONLAB_REMEMBERME' -notin @($secrets.name)) {
    throw 'Produccion no tiene TSPOONLAB_REMEMBERME.'
  }

  & $supabaseCli secrets set "SHORONPO_SYNC_TRIGGER_SECRET=$trigger" --project-ref $ProjectRef | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar la clave operativa en Edge Functions.' }

  $projects = (& $supabaseCli projects list | Out-String | ConvertFrom-Json).projects
  $linked = @($projects | Where-Object linked)
  if ($linked.Count -ne 1 -or $linked[0].ref -ne $ProjectRef) {
    throw "Supabase CLI no esta enlazada exclusivamente a produccion ($ProjectRef)."
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
  $common = @('--host',$values.PGHOST,'--port',$values.PGPORT,'--username',$values.PGUSER,'--dbname',$values.PGDATABASE,'--set','ON_ERROR_STOP=on')
  $escaped = $trigger.Replace("'", "''")
  $baseUrl = "https://$ProjectRef.supabase.co/functions/v1"

  $scheduleSql = @"
set role postgres;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do `$$
declare v_id uuid; v_job record;
begin
  select id into v_id from vault.secrets where name='shoronpo_sync_trigger_secret' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret('$escaped','shoronpo_sync_trigger_secret');
  else
    perform vault.update_secret(v_id,'$escaped','shoronpo_sync_trigger_secret');
  end if;
  for v_job in select jobid from cron.job where jobname in (
    'shoronpo-tspoon-stock-every-6-hours',
    'shoronpo-tspoon-productions-every-6-hours',
    'shoronpo-tspoon-orders-every-6-hours'
  ) loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
`$$;

select cron.schedule('shoronpo-tspoon-stock-every-6-hours','17 */6 * * *',`$job`$
  select net.http_post(
    url:='$baseUrl/tspoonlab-sync-stock',
    headers:=jsonb_build_object('Content-Type','application/json','x-shoronpo-sync-key',(select decrypted_secret from vault.decrypted_secrets where name='shoronpo_sync_trigger_secret' order by created_at desc limit 1),'x-idempotency-key','scheduled-stock-'||extract(epoch from now())::bigint::text||'-'||gen_random_uuid()::text),
    body:='{}'::jsonb
  );
`$job`$);

select cron.schedule('shoronpo-tspoon-productions-every-6-hours','32 */6 * * *',`$job`$
  select net.http_post(
    url:='$baseUrl/tspoonlab-sync-productions',
    headers:=jsonb_build_object('Content-Type','application/json','x-shoronpo-sync-key',(select decrypted_secret from vault.decrypted_secrets where name='shoronpo_sync_trigger_secret' order by created_at desc limit 1),'x-idempotency-key','scheduled-productions-'||extract(epoch from now())::bigint::text||'-'||gen_random_uuid()::text),
    body:='{}'::jsonb
  );
`$job`$);

select cron.schedule('shoronpo-tspoon-orders-every-6-hours','47 */6 * * *',`$job`$
  select net.http_post(
    url:='$baseUrl/tspoonlab-sync-orders',
    headers:=jsonb_build_object('Content-Type','application/json','x-shoronpo-sync-key',(select decrypted_secret from vault.decrypted_secrets where name='shoronpo_sync_trigger_secret' order by created_at desc limit 1),'x-idempotency-key','scheduled-orders-'||extract(epoch from now())::bigint::text||'-'||gen_random_uuid()::text),
    body:='{}'::jsonb
  );
`$job`$);
"@
  $scheduleSql | & $psql @common
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron programar las sincronizaciones.' }

  $headers = @{ 'x-shoronpo-sync-key' = $trigger; 'Content-Type' = 'application/json' }
  $health = Invoke-RestMethod -Method Post -Uri "$baseUrl/tspoonlab-health" -Headers $headers -Body '{}'
  if (-not $health.ok) { throw "Health check rechazado: $($health.status)" }

  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $results = @()
  foreach ($block in @(
    @{ Name='STOCK'; Function='tspoonlab-sync-stock' },
    @{ Name='PRODUCTION'; Function='tspoonlab-sync-productions' },
    @{ Name='ORDER'; Function='tspoonlab-sync-orders' }
  )) {
    $headers['x-idempotency-key'] = "manual-production-$($block.Name.ToLowerInvariant())-$stamp"
    $response = Invoke-RestMethod -Method Post -Uri "$baseUrl/$($block.Function)" -Headers $headers -Body '{}'
    if (-not $response.ok) { throw "$($block.Name) fallo: $($response.status)" }
    $results += "$($block.Name)=$($response.status)"
  }

  $verifySql = "set role postgres; select block||'|'||status||'|'||records_processed from public.tspoon_sync_runs order by started_at desc limit 3;"
  $verification = & $psql @common --no-align --tuples-only --command $verifySql
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron verificar las ejecuciones.' }
  Write-Host "OK: conector productivo saludable; $($results -join ', ')."
  $verification | ForEach-Object { Write-Host $_ }
}
finally {
  $trigger = $null
  if ($null -eq $originalPgPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  else { $env:PGPASSWORD = $originalPgPassword }
}
