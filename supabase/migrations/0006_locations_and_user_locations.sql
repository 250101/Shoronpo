-- 0006_locations_and_user_locations.sql
-- Sistema Shoronpo — Fase 1 v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.
--
-- CORRECCIÓN 7: se elimina por completo el DELETE físico de `locations`
-- desde el cliente (ni policy ni grant). La desactivación es siempre vía
-- `is_active = false`. `user_locations.location_id` pasa de
-- `on delete cascade` a `on delete restrict`: si algún día se quisiera
-- borrar físicamente una ubicación con historial de asignaciones, Postgres
-- debe rechazarlo hasta que se resuelvan esas referencias a mano.
--
-- ORDEN DENTRO DE ESTE ARCHIVO (importante, es el mismo tipo de error que
-- motivó la corrección 1 a nivel de archivos): `locations_select_assigned`
-- necesita `user_location_ids()`, que a su vez necesita la tabla
-- `user_locations`. Por eso, dentro de este único archivo, el orden real
-- de sentencias es: 1) tabla locations, 2) políticas de locations que NO
-- dependen de user_location_ids(), 3) tabla user_locations, 4) función
-- user_location_ids(), 5) recién ahí la política locations_select_assigned,
-- 6) resto de políticas y grants de user_locations, 7) grant_location()/
-- revoke_location(). Una versión anterior de este mismo archivo cometía
-- exactamente el error que la corrección 1 pedía evitar (declaraba esa
-- policy antes de que existieran sus dependencias) — quedó corregido acá.

-- ── locations: tabla ─────────────────────────────────────────────────────

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  type public.location_type not null,
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_not_blank check (length(trim(both from name)) > 0)
);

comment on table public.locations is
  'Ubicaciones operativas. Preparada para múltiples obradores/restaurantes. SIN DELETE físico desde la API — sólo is_active=false.';

create index idx_locations_type on public.locations (type);

alter table public.locations enable row level security;

create trigger trg_locations_touch_updated_at
  before update on public.locations
  for each row execute function public.touch_updated_at();

-- ── locations: políticas que NO dependen de user_location_ids() ────────

create policy locations_select_admin_direccion
  on public.locations
  for select
  to authenticated
  using (public.is_admin() or public.has_role('DIRECCION'));

create policy locations_insert_admin
  on public.locations
  for insert
  to authenticated
  with check (public.is_admin());

create policy locations_update_admin
  on public.locations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Deliberadamente SIN policy ni GRANT de DELETE para nadie (corrección 7).
-- Un borrado físico, si alguna vez hiciera falta, es una operación
-- administrativa explícita con el rol de servicio de las migraciones,
-- nunca a través de la API pública.

revoke all on public.locations from public;
revoke all on public.locations from anon;
grant select, insert, update on public.locations to authenticated;
-- Sin "delete" en la lista de arriba — a propósito.

-- ── user_locations: tabla ────────────────────────────────────────────────

create table public.user_locations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, location_id)
);

comment on table public.user_locations is
  'A qué ubicaciones puede acceder cada usuario. location_id con ON DELETE RESTRICT (corrección 7). Escritura SOLO vía grant_location()/revoke_location().';

create index idx_user_locations_user_id on public.user_locations (user_id);
create index idx_user_locations_location_id on public.user_locations (location_id);

alter table public.user_locations enable row level security;

create trigger trg_user_locations_force_granted
  before insert on public.user_locations
  for each row execute function public.force_granted_fields();

create policy user_locations_select_own
  on public.user_locations
  for select
  to authenticated
  using (user_id = auth.uid());

create policy user_locations_select_admin_direccion
  on public.user_locations
  for select
  to authenticated
  using (public.is_admin() or public.has_role('DIRECCION'));

revoke all on public.user_locations from public;
revoke all on public.user_locations from anon;
grant select on public.user_locations to authenticated;
-- Sin insert/update/delete a "authenticated": sólo grant_location()/
-- revoke_location() (más abajo) escriben acá.

-- ── user_location_ids() — ahora sí existe user_locations ────────────────

create or replace function public.user_location_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ul.location_id
  from public.user_locations ul
  where ul.user_id = auth.uid()
    and public.is_active_user();
$$;

revoke all on function public.user_location_ids() from public;
grant execute on function public.user_location_ids() to authenticated;

comment on function public.user_location_ids() is
  'IDs de ubicaciones del usuario autenticado ACTIVO. Si is_active_user() es false, devuelve conjunto vacío (no error) — un usuario desactivado deja de ver cualquier ubicación aunque conserve filas en user_locations. SECURITY DEFINER, mismo mecanismo anti-recursión que has_role()/is_admin().';

-- ── Recién ahora, la policy de locations que depende de la función ──────

create policy locations_select_assigned
  on public.locations
  for select
  to authenticated
  using (id in (select public.user_location_ids()));

-- ── grant_location() / revoke_location() (corrección 5) ─────────────────
-- Sin restricción de auto-asignación para ADMINISTRADOR (corrección 11 /
-- D18 aprobada con este criterio: un admin ya tiene acceso global vía
-- is_admin(); asignarse o no una ubicación no amplía su alcance real).

create or replace function public.grant_location(p_user_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Sólo un ADMINISTRADOR puede asignar ubicaciones.';
  end if;

  insert into public.user_locations (user_id, location_id)
  values (p_user_id, p_location_id)
  on conflict (user_id, location_id) do nothing;
end;
$$;

revoke all on function public.grant_location(uuid, uuid) from public;
grant execute on function public.grant_location(uuid, uuid) to authenticated;

create or replace function public.revoke_location(p_user_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Sólo un ADMINISTRADOR puede revocar ubicaciones.';
  end if;

  delete from public.user_locations
  where user_id = p_user_id and location_id = p_location_id;
end;
$$;

revoke all on function public.revoke_location(uuid, uuid) from public;
grant execute on function public.revoke_location(uuid, uuid) to authenticated;

-- ROLLBACK (verificado, en orden inverso de creación real):
-- drop function if exists public.revoke_location(uuid, uuid);
-- drop function if exists public.grant_location(uuid, uuid);
-- drop policy if exists locations_select_assigned on public.locations;
-- drop function if exists public.user_location_ids();
-- drop policy if exists user_locations_select_admin_direccion on public.user_locations;
-- drop policy if exists user_locations_select_own on public.user_locations;
-- drop trigger if exists trg_user_locations_force_granted on public.user_locations;
-- drop table if exists public.user_locations;
-- drop policy if exists locations_update_admin on public.locations;
-- drop policy if exists locations_insert_admin on public.locations;
-- drop policy if exists locations_select_admin_direccion on public.locations;
-- drop trigger if exists trg_locations_touch_updated_at on public.locations;
-- drop table if exists public.locations;
