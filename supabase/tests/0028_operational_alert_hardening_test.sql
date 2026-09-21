begin;

insert into public.system_alerts(scope,alert_type,block,severity,message)
values ('DRILL','SYNC_FAILED','STOCK','WARNING','Simulacro aislado');

do $$
begin
  if not exists (
    select 1 from public.system_alerts
    where scope='DRILL' and alert_type='SYNC_FAILED' and block='STOCK'
  ) then
    raise exception 'el simulacro no quedó identificado';
  end if;
  if exists (
    select scope,alert_type,coalesce(block,''),count(*)
    from public.system_alerts
    where status='OPEN'
    group by scope,alert_type,coalesce(block,'')
    having count(*) > 1
  ) then
    raise exception 'hay alertas abiertas duplicadas dentro del mismo alcance';
  end if;
end;
$$;

rollback;
