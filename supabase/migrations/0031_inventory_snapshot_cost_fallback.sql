-- Algunos componentes de tSpoonLab no tienen coste calculado. Se precargan
-- con coste cero para permitir el conteo sin inventar un valor económico.

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
  from public.locations l where l.id=p_location_id and l.is_active and l.type='OBRADOR';
  if v_store_external_id is null then raise exception 'La ubicación no tiene un almacén tSpoonLab asociado.'; end if;
  select r.id into v_run_id from public.tspoon_sync_runs r
  where r.block='STOCK' and r.status='SUCCEEDED'
    and exists(select 1 from public.tspoon_stock_snapshots s where s.run_id=r.id and s.store_external_id=v_store_external_id)
  order by r.finished_at desc nulls last,r.started_at desc limit 1;
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
