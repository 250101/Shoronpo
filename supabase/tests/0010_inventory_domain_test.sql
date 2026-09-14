\set ON_ERROR_STOP on

begin;
set local role authenticated;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
do $$ declare n integer; begin
  select count(*) into n from public.inventory_lines;
  if n <> 236 then raise exception 'OBRADOR esperaba 236 líneas, obtuvo %', n; end if;
end $$;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
do $$ declare n integer; begin
  select count(*) into n from public.inventory_lines;
  if n <> 0 then raise exception 'RESTAURANTE no asignado al obrador vio % líneas', n; end if;
  begin
    insert into public.inventory_periods(location_id,label,recorded_at)
    values('10000000-0000-0000-0000-000000000001','NO-AUTORIZADO',now());
    raise exception 'RESTAURANTE pudo crear un período de OBRADOR';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000007';
do $$ declare n integer; begin
  select count(*) into n from public.inventory_lines;
  if n <> 0 then raise exception 'Usuario inactivo vio % líneas', n; end if;
end $$;

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ declare n integer; begin
  select count(*) into n from public.inventory_lines;
  if n <> 236 then raise exception 'ADMINISTRADOR esperaba 236 líneas, obtuvo %', n; end if;
end $$;

rollback;

do $$ begin
  if has_table_privilege('anon','public.inventory_lines','SELECT') then
    raise exception 'anon tiene SELECT sobre inventory_lines';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('products','inventory_periods','inventory_lines','inventory_reconciliations')
      and not c.relrowsecurity
  ) then raise exception 'Hay tablas de inventario sin RLS'; end if;
end $$;
