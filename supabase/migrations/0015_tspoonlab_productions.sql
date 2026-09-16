-- Fase 6: espejo normalizado de producciones de tSpoonLab.

alter table public.tspoon_sync_runs drop constraint tspoon_sync_runs_block_check;
alter table public.tspoon_sync_runs add constraint tspoon_sync_runs_block_check
  check (block in ('STOCK', 'PRODUCTION', 'ORDER'));

create table public.tspoon_productions (
  external_id text primary key,
  component_external_id text not null,
  description text not null,
  generated_at timestamptz,
  lot text,
  store_external_id text,
  store_name text,
  unit_external_id text,
  unit_name text,
  planned_quantity numeric(18,4),
  actual_quantity numeric(18,4),
  is_started boolean not null default false,
  is_done boolean not null default false,
  is_closed boolean not null default false,
  source_updated_at timestamptz,
  last_run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  synced_at timestamptz not null default now(),
  constraint tspoon_productions_description_not_blank check (length(trim(description)) > 0)
);

create table public.tspoon_production_ingredients (
  production_external_id text not null references public.tspoon_productions(external_id) on delete cascade,
  line_external_id text not null,
  component_external_id text not null,
  description text not null,
  planned_quantity numeric(18,4),
  actual_quantity numeric(18,4),
  unit_external_id text,
  unit_name text,
  store_external_id text,
  store_name text,
  store_quantity numeric(18,4),
  last_run_id uuid not null references public.tspoon_sync_runs(id) on delete restrict,
  synced_at timestamptz not null default now(),
  primary key (production_external_id, line_external_id),
  constraint tspoon_production_ingredients_description_not_blank check (length(trim(description)) > 0)
);

create index idx_tspoon_productions_generated on public.tspoon_productions(generated_at desc);
create index idx_tspoon_production_ingredients_component on public.tspoon_production_ingredients(component_external_id);

alter table public.tspoon_productions enable row level security;
alter table public.tspoon_production_ingredients enable row level security;
alter table public.tspoon_productions force row level security;
alter table public.tspoon_production_ingredients force row level security;

create policy tspoon_productions_authorized_read on public.tspoon_productions for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));
create policy tspoon_production_ingredients_authorized_read on public.tspoon_production_ingredients for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or public.has_role('OBRADOR'));

revoke all on public.tspoon_productions, public.tspoon_production_ingredients from public, anon, authenticated;
grant select on public.tspoon_productions, public.tspoon_production_ingredients to authenticated;
grant select, insert, update, delete on public.tspoon_productions, public.tspoon_production_ingredients to service_role;

