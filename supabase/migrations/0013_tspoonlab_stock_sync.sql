-- Fase 5: snapshots de existencias importados de tSpoonLab.
-- Ninguna tabla guarda credenciales ni payloads crudos del proveedor.

create table public.tspoon_sync_runs (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  block text not null check (block in ('STOCK')),
  status text not null check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  trigger_type text not null default 'MANUAL' check (trigger_type in ('MANUAL', 'SCHEDULED')),
  stores_processed integer not null default 0 check (stores_processed >= 0),
  records_processed integer not null default 0 check (records_processed >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint tspoon_sync_runs_request_key_size check (length(request_key) between 8 and 200)
);

create table public.tspoon_sync_errors (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  store_external_id text,
  code text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint tspoon_sync_errors_message_size check (length(message) between 1 and 500)
);

create table public.tspoon_stock_snapshots (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  captured_at timestamptz not null,
  store_external_id text not null,
  store_name text not null,
  component_external_id text not null,
  component_name text not null,
  unit_external_id text,
  unit_name text,
  quantity_inventory numeric(18,4),
  quantity_input numeric(18,4),
  quantity_output numeric(18,4),
  quantity_total numeric(18,4) not null,
  min_stock numeric(18,4),
  max_stock numeric(18,4),
  cost numeric(18,4),
  created_at timestamptz not null default now(),
  constraint tspoon_stock_snapshot_identity unique (run_id, store_external_id, component_external_id),
  constraint tspoon_stock_store_name_not_blank check (length(trim(store_name)) > 0),
  constraint tspoon_stock_component_name_not_blank check (length(trim(component_name)) > 0)
);

create index idx_tspoon_sync_runs_started on public.tspoon_sync_runs(started_at desc);
create index idx_tspoon_sync_errors_run on public.tspoon_sync_errors(run_id);
create index idx_tspoon_stock_store_captured on public.tspoon_stock_snapshots(store_external_id, captured_at desc);
create index idx_tspoon_stock_component_captured on public.tspoon_stock_snapshots(component_external_id, captured_at desc);

alter table public.tspoon_sync_runs enable row level security;
alter table public.tspoon_sync_errors enable row level security;
alter table public.tspoon_stock_snapshots enable row level security;
alter table public.tspoon_sync_runs force row level security;
alter table public.tspoon_sync_errors force row level security;
alter table public.tspoon_stock_snapshots force row level security;

create policy tspoon_sync_runs_authorized_read on public.tspoon_sync_runs
for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));

create policy tspoon_sync_errors_admin_read on public.tspoon_sync_errors
for select to authenticated using (public.is_admin());

create policy tspoon_stock_authorized_read on public.tspoon_stock_snapshots
for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));

revoke all on public.tspoon_sync_runs, public.tspoon_sync_errors, public.tspoon_stock_snapshots from public, anon, authenticated;
grant select on public.tspoon_sync_runs, public.tspoon_stock_snapshots to authenticated;
grant select on public.tspoon_sync_errors to authenticated;
grant select, insert, update on public.tspoon_sync_runs to service_role;
grant select, insert on public.tspoon_sync_errors, public.tspoon_stock_snapshots to service_role;
grant usage, select on sequence public.tspoon_sync_errors_id_seq, public.tspoon_stock_snapshots_id_seq to service_role;

comment on table public.tspoon_stock_snapshots is 'Snapshots normalizados de existencias; sólo escritura backend y sin payload crudo.';

