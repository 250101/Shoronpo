-- Fase 4 operativa: separar simulacros de incidentes reales, clasificar
-- expiraciones de sesión y reclamar entregas Telegram para evitar carreras.

alter table public.system_alerts
  add column scope text not null default 'LIVE'
    check (scope in ('LIVE','DRILL')),
  add column telegram_claim_token uuid,
  add column telegram_claimed_at timestamptz;

drop index if exists public.system_alerts_one_open_per_type_block;
create unique index system_alerts_one_open_per_scope_type_block
  on public.system_alerts (scope, alert_type, coalesce(block, ''))
  where status = 'OPEN';

create index system_alerts_telegram_claimable
  on public.system_alerts(status, detected_at)
  where scope='LIVE' and (
    telegram_notified_at is null
    or (status='RESOLVED' and telegram_resolution_notified_at is null)
  );

create or replace function public.refresh_system_alerts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block text;
  v_run record;
  v_connector record;
  v_auth_expired boolean := false;
begin
  foreach v_block in array array['STOCK','PRODUCTION','ORDER'] loop
    select status, started_at, error_code into v_run
    from public.tspoon_sync_runs
    where block = v_block
    order by started_at desc
    limit 1;

    if v_run.started_at is null or v_run.started_at < now() - interval '8 hours' then
      insert into public.system_alerts(scope,alert_type,block,severity,message)
      values ('LIVE','SYNC_STALE',v_block,'WARNING','La sincronización no registra una ejecución reciente.')
      on conflict (scope,alert_type,(coalesce(block,''))) where status='OPEN' do nothing;
    else
      update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
      where scope='LIVE' and status='OPEN' and alert_type='SYNC_STALE' and block=v_block;
    end if;

    if v_run.status='FAILED' and v_run.error_code='AUTH_EXPIRED' then
      v_auth_expired := true;
      update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
      where scope='LIVE' and status='OPEN' and alert_type='SYNC_FAILED' and block=v_block;
    elsif v_run.status='FAILED' then
      insert into public.system_alerts(scope,alert_type,block,severity,message)
      values ('LIVE','SYNC_FAILED',v_block,'CRITICAL','La última sincronización terminó con error ' || coalesce(v_run.error_code,'UNKNOWN') || '.')
      on conflict (scope,alert_type,(coalesce(block,''))) where status='OPEN' do nothing;
    elsif v_run.status='SUCCEEDED' then
      update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
      where scope='LIVE' and status='OPEN' and alert_type='SYNC_FAILED' and block=v_block;
    end if;
  end loop;

  select status into v_connector
  from public.tspoonlab_connector_status
  where singleton=true;
  v_auth_expired := v_auth_expired or v_connector.status='AUTH_EXPIRED';

  if v_auth_expired then
    insert into public.system_alerts(scope,alert_type,severity,message)
    values ('LIVE','AUTH_EXPIRED','CRITICAL','La sesión de tSpoonLab expiró y debe renovarse.')
    on conflict (scope,alert_type,(coalesce(block,''))) where status='OPEN' do nothing;
  elsif v_connector.status='HEALTHY' then
    update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
    where scope='LIVE' and status='OPEN' and alert_type='AUTH_EXPIRED';
  end if;
end;
$$;

revoke all on function public.refresh_system_alerts() from public, anon, authenticated;

comment on column public.system_alerts.scope is
  'LIVE participa del panel y Telegram; DRILL queda aislado para simulacros.';
comment on column public.system_alerts.telegram_claim_token is
  'Reclamo temporal de una entrega para evitar envíos concurrentes duplicados.';
