-- Precarga de inventarios desde el último snapshot válido de tSpoonLab.
-- La asociación almacén/ubicación es explícita para no mezclar existencias.

alter table public.locations
add column tspoon_store_external_id text;

create unique index locations_tspoon_store_external_id_unique
on public.locations(tspoon_store_external_id)
where tspoon_store_external_id is not null;

alter table public.inventory_periods
add column source_snapshot_run_id uuid;

alter table public.inventory_periods drop constraint inventory_periods_source_check;
alter table public.inventory_periods add constraint inventory_periods_source_check
check (source in ('APP','SHEETS_IMPORT','TSPOON_SNAPSHOT'));

-- Asociación validada en staging: los 40 productos históricos de OBR-TEST
-- coinciden exactamente con los 40 componentes del almacén Elaborados.
update public.locations
set tspoon_store_external_id='69818086292505993121792404118853282720'
where code='OBR-TEST' and type='OBRADOR' and tspoon_store_external_id is null;

create or replace function public.get_latest_inventory_snapshot(p_location_id uuid)
returns table(
  snapshot_run_id uuid,
  captured_at timestamptz,
  store_external_id text,
  store_name text,
  product_name text,
  family text,
  unit text,
  theoretical_quantity numeric,
  theoretical_cost numeric
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_store_external_id text;
  v_run_id uuid;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo.'; end if;
  if not (public.is_admin() or (public.has_role('OBRADOR') and p_location_id in (select public.user_location_ids()))) then
    raise exception 'Sin permiso para crear inventario en esta ubicación.';
  end if;

  select l.tspoon_store_external_id into v_store_external_id
  from public.locations l
  where l.id=p_location_id and l.is_active and l.type='OBRADOR';
  if v_store_external_id is null then
    raise exception 'La ubicación no tiene un almacén tSpoonLab asociado.';
  end if;

  select r.id into v_run_id
  from public.tspoon_sync_runs r
  where r.block='STOCK' and r.status='SUCCEEDED'
    and exists(select 1 from public.tspoon_stock_snapshots s where s.run_id=r.id and s.store_external_id=v_store_external_id)
  order by r.finished_at desc nulls last, r.started_at desc
  limit 1;
  if v_run_id is null then raise exception 'No hay un snapshot de stock válido para esta ubicación.'; end if;

  return query
  select s.run_id,s.captured_at,s.store_external_id,s.store_name,p.name,p.family,
    coalesce(nullif(trim(s.unit_name),''),p.unit),s.quantity_total,coalesce(s.cost,0)
  from public.tspoon_stock_snapshots s
  join public.products p on p.normalized_name=lower(trim(s.component_name)) and p.is_active
  where s.run_id=v_run_id and s.store_external_id=v_store_external_id
  order by p.family,p.name;
end;
$$;

revoke all on function public.get_latest_inventory_snapshot(uuid) from public,anon;
grant execute on function public.get_latest_inventory_snapshot(uuid) to authenticated;

create or replace function public.close_inventory_period(
  p_location_id uuid,
  p_label text,
  p_recorded_at timestamptz,
  p_lines jsonb,
  p_snapshot_run_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period_id uuid;
  v_input_count integer;
  v_inserted_count integer;
  v_store_external_id text;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo.'; end if;
  if not (public.is_admin() or (public.has_role('OBRADOR') and p_location_id in (select public.user_location_ids()))) then
    raise exception 'Sin permiso para cerrar inventario en esta ubicación.';
  end if;
  if p_label is null or length(trim(p_label))=0 or length(p_label)>80 then raise exception 'Nombre de período inválido.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>2000 then
    raise exception 'El inventario debe contener entre 1 y 2000 líneas.';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as x(actual_quantity numeric) where x.actual_quantity is null) then
    raise exception 'Todos los productos deben tener conteo físico.';
  end if;

  select tspoon_store_external_id into v_store_external_id from public.locations where id=p_location_id;
  if p_snapshot_run_id is not null and not exists(
    select 1 from public.tspoon_sync_runs r join public.tspoon_stock_snapshots s on s.run_id=r.id
    where r.id=p_snapshot_run_id and r.block='STOCK' and r.status='SUCCEEDED'
      and s.store_external_id=v_store_external_id
  ) then raise exception 'El snapshot indicado no es válido para esta ubicación.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text||':'||trim(p_label),0));
  if exists(select 1 from public.inventory_periods where location_id=p_location_id and label=trim(p_label)) then
    raise exception 'El período ya existe para esta ubicación.';
  end if;

  select count(*) into v_input_count from jsonb_to_recordset(p_lines) as x(product_name text);
  if exists(
    select 1 from jsonb_to_recordset(p_lines) as x(product_name text)
    left join public.products p on p.normalized_name=lower(trim(x.product_name)) and p.is_active
    where p.id is null
  ) then raise exception 'El inventario contiene productos inexistentes o inactivos.'; end if;
  if (select count(distinct lower(trim(x.product_name))) from jsonb_to_recordset(p_lines) as x(product_name text))<>v_input_count then
    raise exception 'El inventario contiene productos duplicados.';
  end if;

  insert into public.inventory_periods(location_id,label,recorded_at,status,source,source_snapshot_run_id,created_by)
  values(p_location_id,trim(p_label),coalesce(p_recorded_at,now()),'CLOSED',
    case when p_snapshot_run_id is null then 'APP' else 'TSPOON_SNAPSHOT' end,p_snapshot_run_id,auth.uid())
  returning id into v_period_id;

  insert into public.inventory_lines(
    period_id,product_id,theoretical_quantity,actual_quantity,deviation_quantity,deviation_pct,
    theoretical_cost,actual_cost,impact,deviation_status
  )
  select v_period_id,p.id,x.theoretical_quantity,x.actual_quantity,
    x.actual_quantity-x.theoretical_quantity,
    case when abs(x.theoretical_quantity)>0.000001 then (x.actual_quantity-x.theoretical_quantity)/abs(x.theoretical_quantity) else 0 end,
    x.theoretical_cost,
    case when abs(x.theoretical_quantity)>0.000001 then x.actual_quantity*(x.theoretical_cost/x.theoretical_quantity) else 0 end,
    round(abs(x.actual_quantity-x.theoretical_quantity)*
      case when abs(x.theoretical_quantity)>0.000001 then abs(x.theoretical_cost/x.theoretical_quantity) else 0 end,2),
    case
      when abs(case when abs(x.theoretical_quantity)>0.000001 then (x.actual_quantity-x.theoretical_quantity)/abs(x.theoretical_quantity) else 0 end)<=0.02 then 'COINCIDE'::public.inventory_deviation_status
      when abs(case when abs(x.theoretical_quantity)>0.000001 then (x.actual_quantity-x.theoretical_quantity)/abs(x.theoretical_quantity) else 0 end)<=0.15 then 'LEVE'::public.inventory_deviation_status
      else 'ELEVADA'::public.inventory_deviation_status
    end
  from jsonb_to_recordset(p_lines) as x(product_name text,theoretical_quantity numeric,actual_quantity numeric,theoretical_cost numeric)
  join public.products p on p.normalized_name=lower(trim(x.product_name));
  get diagnostics v_inserted_count=row_count;
  if v_inserted_count<>v_input_count then raise exception 'No se insertaron todas las líneas.'; end if;
  return v_period_id;
end;
$$;

revoke all on function public.close_inventory_period(uuid,text,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.close_inventory_period(uuid,text,timestamptz,jsonb,uuid) to authenticated;

-- Evita mantener dos firmas con comportamientos diferentes.
drop function if exists public.close_inventory_period(uuid,text,timestamptz,jsonb);
