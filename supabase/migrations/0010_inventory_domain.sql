-- Shoronpo - Fase 2: dominio de inventario.
-- Requiere las migraciones 0001-0008 de seguridad y ubicaciones.

create type public.inventory_period_status as enum ('DRAFT', 'CLOSED');
create type public.inventory_deviation_status as enum ('COINCIDE', 'LEVE', 'ELEVADA');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(trim(name))) stored,
  family text not null,
  unit text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_family_not_blank check (length(trim(family)) > 0),
  constraint products_unit_not_blank check (length(trim(unit)) > 0),
  constraint products_normalized_name_unique unique (normalized_name)
);

create table public.inventory_periods (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  label text not null,
  recorded_at timestamptz not null,
  status public.inventory_period_status not null default 'DRAFT',
  source text not null default 'APP' check (source in ('APP', 'SHEETS_IMPORT')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_periods_label_not_blank check (length(trim(label)) > 0),
  constraint inventory_periods_location_label_unique unique (location_id, label)
);

create table public.inventory_lines (
  id bigint generated always as identity primary key,
  period_id uuid not null references public.inventory_periods(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  theoretical_quantity numeric(18,4) not null,
  actual_quantity numeric(18,4) not null,
  deviation_quantity numeric(18,4) not null,
  deviation_pct numeric(12,6) not null,
  theoretical_cost numeric(18,4) not null,
  actual_cost numeric(18,4) not null,
  impact numeric(18,4) not null check (impact >= 0),
  deviation_status public.inventory_deviation_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_lines_period_product_unique unique (period_id, product_id)
);

create table public.inventory_reconciliations (
  id uuid primary key,
  inventory_line_id bigint not null references public.inventory_lines(id) on delete restrict,
  cause text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  comment text,
  occurred_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_reconciliations_cause_not_blank check (length(trim(cause)) > 0),
  constraint inventory_reconciliations_comment_size check (comment is null or length(comment) <= 2000)
);

create index idx_inventory_periods_location_recorded on public.inventory_periods(location_id, recorded_at desc);
create index idx_inventory_lines_period on public.inventory_lines(period_id);
create index idx_inventory_lines_product on public.inventory_lines(product_id);
create index idx_inventory_reconciliations_line on public.inventory_reconciliations(inventory_line_id);

create trigger trg_products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();
create trigger trg_inventory_periods_touch_updated_at before update on public.inventory_periods
for each row execute function public.touch_updated_at();
create trigger trg_inventory_lines_touch_updated_at before update on public.inventory_lines
for each row execute function public.touch_updated_at();
create trigger trg_inventory_reconciliations_touch_updated_at before update on public.inventory_reconciliations
for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
alter table public.inventory_periods enable row level security;
alter table public.inventory_lines enable row level security;
alter table public.inventory_reconciliations enable row level security;

create policy products_select_active_users on public.products for select to authenticated
using (public.is_active_user());
create policy products_write_admin on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy inventory_periods_select_authorized on public.inventory_periods for select to authenticated
using (public.is_admin() or public.has_role('DIRECCION') or location_id in (select public.user_location_ids()));
create policy inventory_periods_insert_authorized on public.inventory_periods for insert to authenticated
with check (public.is_admin() or (public.has_role('OBRADOR') and location_id in (select public.user_location_ids())));
create policy inventory_periods_update_authorized on public.inventory_periods for update to authenticated
using (public.is_admin() or (public.has_role('OBRADOR') and location_id in (select public.user_location_ids())))
with check (public.is_admin() or (public.has_role('OBRADOR') and location_id in (select public.user_location_ids())));

create policy inventory_lines_select_authorized on public.inventory_lines for select to authenticated
using (exists (
  select 1 from public.inventory_periods p where p.id=period_id and
  (public.is_admin() or public.has_role('DIRECCION') or p.location_id in (select public.user_location_ids()))
));
create policy inventory_lines_insert_authorized on public.inventory_lines for insert to authenticated
with check (exists (
  select 1 from public.inventory_periods p where p.id=period_id and
  (public.is_admin() or (public.has_role('OBRADOR') and p.location_id in (select public.user_location_ids())))
));
create policy inventory_lines_update_authorized on public.inventory_lines for update to authenticated
using (exists (
  select 1 from public.inventory_periods p where p.id=period_id and
  (public.is_admin() or (public.has_role('OBRADOR') and p.location_id in (select public.user_location_ids())))
)) with check (exists (
  select 1 from public.inventory_periods p where p.id=period_id and
  (public.is_admin() or (public.has_role('OBRADOR') and p.location_id in (select public.user_location_ids())))
));

create policy inventory_reconciliations_select_authorized on public.inventory_reconciliations for select to authenticated
using (exists (
  select 1 from public.inventory_lines l join public.inventory_periods p on p.id=l.period_id
  where l.id=inventory_line_id and
  (public.is_admin() or public.has_role('DIRECCION') or p.location_id in (select public.user_location_ids()))
));
create policy inventory_reconciliations_insert_authorized on public.inventory_reconciliations for insert to authenticated
with check (exists (
  select 1 from public.inventory_lines l join public.inventory_periods p on p.id=l.period_id
  where l.id=inventory_line_id and
  (public.is_admin() or (public.has_role('OBRADOR') and p.location_id in (select public.user_location_ids())))
));
create policy inventory_reconciliations_update_authorized on public.inventory_reconciliations for update to authenticated
using (created_by=auth.uid() or public.is_admin())
with check (created_by=auth.uid() or public.is_admin());
create policy inventory_reconciliations_delete_authorized on public.inventory_reconciliations for delete to authenticated
using (created_by=auth.uid() or public.is_admin());

create or replace function public.close_inventory_period(
  p_location_id uuid,
  p_label text,
  p_recorded_at timestamptz,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period_id uuid;
  v_input_count integer;
  v_inserted_count integer;
begin
  if not public.is_active_user() then raise exception 'Usuario inactivo.'; end if;
  if not (public.is_admin() or (public.has_role('OBRADOR') and p_location_id in (select public.user_location_ids()))) then
    raise exception 'Sin permiso para cerrar inventario en esta ubicación.';
  end if;
  if p_label is null or length(trim(p_label))=0 or length(p_label)>80 then raise exception 'Nombre de período inválido.'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>2000 then
    raise exception 'El inventario debe contener entre 1 y 2000 líneas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text||':'||trim(p_label),0));
  if exists(select 1 from public.inventory_periods where location_id=p_location_id and label=trim(p_label)) then
    raise exception 'El período ya existe para esta ubicación.';
  end if;

  select count(*) into v_input_count from jsonb_to_recordset(p_lines) as x(product_name text);
  if exists(
    select 1 from jsonb_to_recordset(p_lines) as x(product_name text)
    left join public.products p on p.normalized_name=lower(trim(x.product_name)) and p.is_active
    where p.id is null
  ) then raise exception 'El archivo contiene productos inexistentes o inactivos.'; end if;

  insert into public.inventory_periods(location_id,label,recorded_at,status,source,created_by)
  values(p_location_id,trim(p_label),coalesce(p_recorded_at,now()),'CLOSED','APP',auth.uid()) returning id into v_period_id;

  insert into public.inventory_lines(
    period_id,product_id,theoretical_quantity,actual_quantity,deviation_quantity,deviation_pct,
    theoretical_cost,actual_cost,impact,deviation_status
  )
  select v_period_id,p.id,x.theoretical_quantity,x.actual_quantity,
    x.actual_quantity-x.theoretical_quantity,
    case when abs(x.theoretical_quantity)>0.000001 then (x.actual_quantity-x.theoretical_quantity)/abs(x.theoretical_quantity) else 0 end,
    x.theoretical_cost,x.actual_cost,
    round(abs(case when abs(x.actual_quantity-x.theoretical_quantity)>0.000001 then x.actual_quantity-x.theoretical_quantity else 0 end)*
      case when abs(x.theoretical_quantity)>0.000001 and abs(x.theoretical_cost)>0.000001 then abs(x.theoretical_cost/x.theoretical_quantity)
           when abs(x.actual_quantity)>0.000001 and abs(x.actual_cost)>0.000001 then abs(x.actual_cost/x.actual_quantity) else 0 end,2),
    case
      when abs(case when abs(x.theoretical_quantity)>0.000001 then (x.actual_quantity-x.theoretical_quantity)/abs(x.theoretical_quantity) else 0 end)<=0.02 then 'COINCIDE'::public.inventory_deviation_status
      when abs(case when abs(x.theoretical_quantity)>0.000001 then (x.actual_quantity-x.theoretical_quantity)/abs(x.theoretical_quantity) else 0 end)<=0.15 then 'LEVE'::public.inventory_deviation_status
      else 'ELEVADA'::public.inventory_deviation_status
    end
  from jsonb_to_recordset(p_lines) as x(product_name text,theoretical_quantity numeric,actual_quantity numeric,theoretical_cost numeric,actual_cost numeric)
  join public.products p on p.normalized_name=lower(trim(x.product_name));
  get diagnostics v_inserted_count=row_count;
  if v_inserted_count<>v_input_count then raise exception 'No se insertaron todas las líneas.'; end if;
  return v_period_id;
end;
$$;

revoke all on function public.close_inventory_period(uuid,text,timestamptz,jsonb) from public,anon;
grant execute on function public.close_inventory_period(uuid,text,timestamptz,jsonb) to authenticated;

revoke all on public.products, public.inventory_periods, public.inventory_lines, public.inventory_reconciliations from public, anon;
grant select on public.products to authenticated;
grant select, insert, update on public.inventory_periods, public.inventory_lines to authenticated;
grant select, insert, update, delete on public.inventory_reconciliations to authenticated;
grant usage, select on sequence public.inventory_lines_id_seq to authenticated;

grant select, insert, update on public.products, public.inventory_periods, public.inventory_lines to service_role;
grant select, insert, update, delete on public.inventory_reconciliations to service_role;
grant usage, select on sequence public.inventory_lines_id_seq to service_role;
