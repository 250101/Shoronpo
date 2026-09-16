begin;

select public.refresh_system_alerts();

do $$
begin
  if exists (
    select 1 from public.system_alerts
    where status='OPEN' and resolved_at is not null
  ) then
    raise exception 'una alerta abierta no puede tener resolved_at';
  end if;
  if exists (
    select alert_type,coalesce(block,''),count(*)
    from public.system_alerts
    where status='OPEN'
    group by alert_type,coalesce(block,'')
    having count(*) > 1
  ) then
    raise exception 'hay alertas abiertas duplicadas';
  end if;
end;
$$;

rollback;
