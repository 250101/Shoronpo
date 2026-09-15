-- 0003_user_roles.sql
-- Sistema Shoronpo — Fase 1 v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.
--
-- CAMBIO DE ORDEN respecto de v1: esta tabla se sigue creando temprano
-- (0003), pero ahora `profiles` se crea INMEDIATAMENTE DESPUÉS (0004) y
-- ANTES de las funciones auxiliares (0005) — porque is_active_user()
-- (corrección 2) necesita `profiles`, y has_role()/is_admin() (corrección 2)
-- ahora incorporan esa verificación, así que ambas tablas deben existir
-- antes de que exista cualquier función auxiliar. Ver 0005 para el detalle
-- completo de por qué este orden es el único que compila sin referencias
-- a objetos inexistentes.
--
-- CAMBIO DE DISEÑO (corrección 5): no hay policy ni GRANT de UPDATE en
-- esta tabla, nunca. Conceder/revocar un rol se hace exclusivamente a
-- través de las funciones grant_role()/revoke_role() (definidas en 0005,
-- una vez que existe has_role()) — nunca con un INSERT/UPDATE/DELETE
-- directo vía PostgREST. Por eso esta migración NO otorga INSERT ni
-- DELETE a "authenticated": sólo SELECT. Los GRANTS de INSERT/DELETE que
-- sí hacen falta se resuelven vía GRANT EXECUTE sobre las funciones, no
-- vía GRANT sobre la tabla.

create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id smallint not null references public.roles(id) on delete restrict,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, role_id)
);

comment on table public.user_roles is
  'Asignación de roles. Sin policy ni grant de UPDATE nunca. Escritura SOLO vía grant_role()/revoke_role() (0005) — nunca INSERT/UPDATE/DELETE directo desde el cliente, ni siquiera por un ADMINISTRADOR.';

create index idx_user_roles_user_id on public.user_roles (user_id);
create index idx_user_roles_role_id on public.user_roles (role_id);

alter table public.user_roles enable row level security;

-- Defensa en profundidad: aunque grant_role()/revoke_role() ya fuerzan
-- estos valores (ver 0005), un trigger BEFORE INSERT los vuelve a forzar
-- por si en el futuro alguien agregara, por error, un GRANT de INSERT
-- directo sobre esta tabla — el valor que mande el cliente nunca prevalece.
create or replace function public.force_granted_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.granted_by = auth.uid();
  new.granted_at = now();
  return new;
end;
$$;

comment on function public.force_granted_fields() is
  'BEFORE INSERT en user_roles y user_locations: ignora cualquier valor de granted_by/granted_at que mande el cliente y los reemplaza siempre por auth.uid()/now(). No es SECURITY DEFINER: sólo lee auth.uid() y now(), no consulta ninguna tabla.';

create trigger trg_user_roles_force_granted
  before insert on public.user_roles
  for each row execute function public.force_granted_fields();

-- Policy mínima: cada quien ve sus propias asignaciones. La policy de
-- ADMINISTRADOR se agrega en 0005 (necesita is_admin(), todavía no existe).
-- Un usuario inactivo también puede ver esto — no es una operación de
-- negocio, es sólo "cuáles son mis roles"; el bloqueo real de negocio pasa
-- por is_active_user() en las tablas de datos, no acá.
create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- ── GRANTS (corrección 3) ──────────────────────────────────────────────
revoke all on public.user_roles from public;
revoke all on public.user_roles from anon;
grant select on public.user_roles to authenticated;
-- Deliberadamente SIN insert/update/delete a "authenticated": la única vía
-- de escritura es grant_role()/revoke_role() (SECURITY DEFINER, 0005).

-- ROLLBACK (verificado: sin dependientes hasta 0005/0007):
-- drop trigger if exists trg_user_roles_force_granted on public.user_roles;
-- drop function if exists public.force_granted_fields();
-- drop table if exists public.user_roles;
