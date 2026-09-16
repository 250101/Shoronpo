-- Reemplazos atómicos para espejos de producciones y pedidos.
-- Cada llamada confirma todos los cambios o revierte todos ante cualquier error.

create or replace function public.replace_tspoon_production(
  p_production jsonb,
  p_ingredients jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_external_id text := p_production ->> 'external_id';
begin
  if v_external_id is null or jsonb_typeof(p_production) <> 'object'
     or jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_PRODUCTION_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) item
    where item ->> 'production_external_id' is distinct from v_external_id
  ) then
    raise exception 'INGREDIENT_PRODUCTION_MISMATCH';
  end if;

  insert into public.tspoon_productions (
    external_id, component_external_id, description, generated_at, lot,
    store_external_id, store_name, unit_external_id, unit_name,
    planned_quantity, actual_quantity, is_started, is_done, is_closed,
    source_updated_at, last_run_id, synced_at
  )
  select external_id, component_external_id, description, generated_at, lot,
    store_external_id, store_name, unit_external_id, unit_name,
    planned_quantity, actual_quantity, is_started, is_done, is_closed,
    source_updated_at, last_run_id, synced_at
  from jsonb_to_record(p_production) as x(
    external_id text, component_external_id text, description text,
    generated_at timestamptz, lot text, store_external_id text, store_name text,
    unit_external_id text, unit_name text, planned_quantity numeric,
    actual_quantity numeric, is_started boolean, is_done boolean,
    is_closed boolean, source_updated_at timestamptz, last_run_id uuid,
    synced_at timestamptz
  )
  on conflict (external_id) do update set
    component_external_id=excluded.component_external_id,
    description=excluded.description, generated_at=excluded.generated_at,
    lot=excluded.lot, store_external_id=excluded.store_external_id,
    store_name=excluded.store_name, unit_external_id=excluded.unit_external_id,
    unit_name=excluded.unit_name, planned_quantity=excluded.planned_quantity,
    actual_quantity=excluded.actual_quantity, is_started=excluded.is_started,
    is_done=excluded.is_done, is_closed=excluded.is_closed,
    source_updated_at=excluded.source_updated_at,
    last_run_id=excluded.last_run_id, synced_at=excluded.synced_at;

  delete from public.tspoon_production_ingredients
  where production_external_id=v_external_id;

  insert into public.tspoon_production_ingredients (
    production_external_id, line_external_id, component_external_id,
    description, planned_quantity, actual_quantity, unit_external_id,
    unit_name, store_external_id, store_name, store_quantity,
    last_run_id, synced_at
  )
  select production_external_id, line_external_id, component_external_id,
    description, planned_quantity, actual_quantity, unit_external_id,
    unit_name, store_external_id, store_name, store_quantity,
    last_run_id, synced_at
  from jsonb_to_recordset(coalesce(p_ingredients, '[]'::jsonb)) as x(
    production_external_id text, line_external_id text,
    component_external_id text, description text, planned_quantity numeric,
    actual_quantity numeric, unit_external_id text, unit_name text,
    store_external_id text, store_name text, store_quantity numeric,
    last_run_id uuid, synced_at timestamptz
  );
end;
$$;

create or replace function public.replace_tspoon_order(
  p_order jsonb,
  p_deliveries jsonb,
  p_lines jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id text := p_order ->> 'external_id';
begin
  if v_order_id is null or jsonb_typeof(p_order) <> 'object'
     or jsonb_typeof(coalesce(p_deliveries, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_ORDER_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_deliveries, '[]'::jsonb)) item
    where item ->> 'order_external_id' is distinct from v_order_id
  ) then
    raise exception 'DELIVERY_ORDER_MISMATCH';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) line
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_deliveries, '[]'::jsonb)) delivery
      where delivery ->> 'external_id' = line ->> 'delivery_external_id'
    )
  ) then
    raise exception 'LINE_DELIVERY_MISMATCH';
  end if;

  insert into public.tspoon_orders (
    external_id, description, generated_at, currency, total_cost,
    is_locked, last_run_id, synced_at
  )
  select external_id, description, generated_at, currency, total_cost,
    is_locked, last_run_id, synced_at
  from jsonb_to_record(p_order) as x(
    external_id text, description text, generated_at timestamptz,
    currency text, total_cost numeric, is_locked boolean,
    last_run_id uuid, synced_at timestamptz
  )
  on conflict (external_id) do update set
    description=excluded.description, generated_at=excluded.generated_at,
    currency=excluded.currency, total_cost=excluded.total_cost,
    is_locked=excluded.is_locked, last_run_id=excluded.last_run_id,
    synced_at=excluded.synced_at;

  insert into public.tspoon_order_deliveries (
    external_id, order_external_id, customer_external_id, customer_name,
    responsible, generated_at, reception_at, is_closed, total_cost,
    last_run_id, synced_at
  )
  select external_id, order_external_id, customer_external_id, customer_name,
    responsible, generated_at, reception_at, is_closed, total_cost,
    last_run_id, synced_at
  from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb)) as x(
    external_id text, order_external_id text, customer_external_id text,
    customer_name text, responsible text, generated_at timestamptz,
    reception_at timestamptz, is_closed boolean, total_cost numeric,
    last_run_id uuid, synced_at timestamptz
  )
  on conflict (external_id) do update set
    order_external_id=excluded.order_external_id,
    customer_external_id=excluded.customer_external_id,
    customer_name=excluded.customer_name, responsible=excluded.responsible,
    generated_at=excluded.generated_at, reception_at=excluded.reception_at,
    is_closed=excluded.is_closed, total_cost=excluded.total_cost,
    last_run_id=excluded.last_run_id, synced_at=excluded.synced_at;

  delete from public.tspoon_order_deliveries d
  where d.order_external_id=v_order_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_deliveries, '[]'::jsonb)) item
      where item ->> 'external_id'=d.external_id
    );

  delete from public.tspoon_order_lines l
  where exists (
    select 1 from jsonb_array_elements(coalesce(p_deliveries, '[]'::jsonb)) item
    where item ->> 'external_id'=l.delivery_external_id
  );

  insert into public.tspoon_order_lines (
    delivery_external_id, line_external_id, component_external_id,
    description, quantity, unit_external_id, unit_name, store_external_id,
    store_name, unit_cost, is_sent, lots, last_run_id, synced_at
  )
  select delivery_external_id, line_external_id, component_external_id,
    description, quantity, unit_external_id, unit_name, store_external_id,
    store_name, unit_cost, is_sent, lots, last_run_id, synced_at
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as x(
    delivery_external_id text, line_external_id text,
    component_external_id text, description text, quantity numeric,
    unit_external_id text, unit_name text, store_external_id text,
    store_name text, unit_cost numeric, is_sent boolean, lots jsonb,
    last_run_id uuid, synced_at timestamptz
  );
end;
$$;

revoke all on function public.replace_tspoon_production(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.replace_tspoon_order(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.replace_tspoon_production(jsonb,jsonb) to service_role;
grant execute on function public.replace_tspoon_order(jsonb,jsonb,jsonb) to service_role;

comment on function public.replace_tspoon_production(jsonb,jsonb) is
  'Reemplaza cabecera e ingredientes en una única transacción. Sólo service_role.';
comment on function public.replace_tspoon_order(jsonb,jsonb,jsonb) is
  'Reemplaza pedido, entregas y líneas en una única transacción. Sólo service_role.';
