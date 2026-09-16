-- Fase 6: pedidos, entregas y salidas reales de tSpoonLab.

create table public.tspoon_orders (
  external_id text primary key,
  description text not null,
  generated_at timestamptz,
  currency text,
  total_cost numeric(18,4),
  is_locked boolean not null default false,
  last_run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  synced_at timestamptz not null default now(),
  constraint tspoon_orders_description_not_blank check (length(trim(description)) > 0)
);

create table public.tspoon_order_deliveries (
  external_id text primary key,
  order_external_id text not null references public.tspoon_orders(external_id) on delete cascade,
  customer_external_id text,
  customer_name text,
  responsible text,
  generated_at timestamptz,
  reception_at timestamptz,
  is_closed boolean not null default false,
  total_cost numeric(18,4),
  last_run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  synced_at timestamptz not null default now()
);

create table public.tspoon_order_lines (
  delivery_external_id text not null references public.tspoon_order_deliveries(external_id) on delete cascade,
  line_external_id text not null,
  component_external_id text not null,
  description text not null,
  quantity numeric(18,4),
  unit_external_id text,
  unit_name text,
  store_external_id text,
  store_name text,
  unit_cost numeric(18,4),
  is_sent boolean not null default false,
  lots jsonb not null default '[]'::jsonb,
  last_run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  synced_at timestamptz not null default now(),
  primary key (delivery_external_id, line_external_id),
  constraint tspoon_order_lines_description_not_blank check (length(trim(description)) > 0),
  constraint tspoon_order_lines_lots_array check (jsonb_typeof(lots)='array')
);

create index idx_tspoon_orders_generated on public.tspoon_orders(generated_at desc);
create index idx_tspoon_deliveries_reception on public.tspoon_order_deliveries(reception_at desc);
create index idx_tspoon_order_lines_component on public.tspoon_order_lines(component_external_id);

alter table public.tspoon_orders enable row level security;
alter table public.tspoon_order_deliveries enable row level security;
alter table public.tspoon_order_lines enable row level security;
alter table public.tspoon_orders force row level security;
alter table public.tspoon_order_deliveries force row level security;
alter table public.tspoon_order_lines force row level security;

create policy tspoon_orders_authorized_read on public.tspoon_orders for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));
create policy tspoon_deliveries_authorized_read on public.tspoon_order_deliveries for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));
create policy tspoon_order_lines_authorized_read on public.tspoon_order_lines for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));

revoke all on public.tspoon_orders, public.tspoon_order_deliveries, public.tspoon_order_lines from public,anon,authenticated;
grant select on public.tspoon_orders, public.tspoon_order_deliveries, public.tspoon_order_lines to authenticated;
grant select,insert,update,delete on public.tspoon_orders, public.tspoon_order_deliveries, public.tspoon_order_lines to service_role;

