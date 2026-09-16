-- Fase 11: incidentes operativos automáticos sin servicios externos.

create table public.system_alerts (
  id bigint generated always as identity primary key,
  alert_type text not null check (alert_type in ('SYNC_FAILED','SYNC_STALE','AUTH_EXPIRED')),
  block text check (block is null or block in ('STOCK','PRODUCTION','ORDER')),
  severity text not null check (severity in ('WARNING','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  message text not null check (length(message) between 1 and 300),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index system_alerts_one_open_per_type_block
  on public.system_alerts (alert_type, coalesce(block, ''))
  where status = 'OPEN';
create index system_alerts_status_detected on public.system_alerts(status, detected_at desc);

alter table public.system_alerts enable row level security;
alter table public.system_alerts force row level security;

create policy system_alerts_authorized_read on public.system_alerts
for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));

revoke all on public.system_alerts from public, anon, authenticated;
grant select on public.system_alerts to authenticated;
grant select, insert, update on public.system_alerts to service_role;
grant usage, select on sequence public.system_alerts_id_seq to service_role;

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
begin
  foreach v_block in array array['STOCK','PRODUCTION','ORDER'] loop
    select status, started_at, error_code into v_run
    from public.tspoon_sync_runs
    where block = v_block
    order by started_at desc
    limit 1;

    if v_run.started_at is null or v_run.started_at < now() - interval '8 hours' then
      if not exists (select 1 from public.system_alerts where status='OPEN' and alert_type='SYNC_STALE' and block=v_block) then
        insert into public.system_alerts(alert_type,block,severity,message)
        values ('SYNC_STALE',v_block,'WARNING','La sincronización no registra una ejecución reciente.');
      end if;
    else
      update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
      where status='OPEN' and alert_type='SYNC_STALE' and block=v_block;
    end if;

    if v_run.status = 'FAILED' then
      if not exists (select 1 from public.system_alerts where status='OPEN' and alert_type='SYNC_FAILED' and block=v_block) then
        insert into public.system_alerts(alert_type,block,severity,message)
        values ('SYNC_FAILED',v_block,'CRITICAL','La última sincronización terminó con error ' || coalesce(v_run.error_code,'UNKNOWN') || '.');
      end if;
    elsif v_run.status = 'SUCCEEDED' then
      update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
      where status='OPEN' and alert_type='SYNC_FAILED' and block=v_block;
    end if;
  end loop;

  select status into v_connector from public.tspoonlab_connector_status where singleton=true;
  if v_connector.status = 'AUTH_EXPIRED' then
    if not exists (select 1 from public.system_alerts where status='OPEN' and alert_type='AUTH_EXPIRED') then
      insert into public.system_alerts(alert_type,severity,message)
      values ('AUTH_EXPIRED','CRITICAL','La sesión de tSpoonLab expiró y debe renovarse.');
    end if;
  elsif v_connector.status = 'HEALTHY' then
    update public.system_alerts set status='RESOLVED',resolved_at=now(),updated_at=now()
    where status='OPEN' and alert_type='AUTH_EXPIRED';
  end if;
end;
$$;

revoke all on function public.refresh_system_alerts() from public, anon, authenticated;

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='shoronpo-refresh-system-alerts';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'shoronpo-refresh-system-alerts',
  '*/15 * * * *',
  'select public.refresh_system_alerts();'
);

select public.refresh_system_alerts();
