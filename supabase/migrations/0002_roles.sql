-- 0002_roles.sql
-- Sistema Shoronpo — Fase 1 v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.

create table public.roles (
  id smallint generated always as identity primary key,
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table public.roles is
  'Catálogo fijo de roles. Sólo se modifica por migración o por el service role — nunca desde el cliente (ver GRANTS más abajo: ni siquiera ADMINISTRADOR tiene INSERT/UPDATE/DELETE vía API en esta fase).';

alter table public.roles enable row level security;

create policy roles_select_authenticated
  on public.roles
  for select
  to authenticated
  using (true);

-- ── GRANTS explícitos (corrección 3) ──────────────────────────────────────
-- No se depende de privilegios default de Supabase. Se listan explícitamente
-- los tres roles de PostgREST: anon, authenticated, service_role.
revoke all on public.roles from public;
revoke all on public.roles from anon;
grant select on public.roles to authenticated;
-- Sin INSERT/UPDATE/DELETE para authenticated ni anon.
-- service_role no necesita GRANT explícito: en Supabase bypassea RLS y
-- tiene privilegios de superusuario a nivel de la base — se documenta acá
-- por completitud, no porque haga falta una sentencia adicional.

insert into public.roles (code, description) values
  ('ADMINISTRADOR', 'Acceso completo: usuarios, roles, ubicaciones, configuración, integraciones, auditoría, resincronizaciones.'),
  ('DIRECCION',     'Lectura global: análisis, costes, históricos, planificación, todas las ubicaciones. Sin administración de usuarios salvo autorización futura.'),
  ('OBRADOR',       'Inventario y almacenes del obrador, producciones, pedidos, conciliaciones, planificación operativa.'),
  ('RESTAURANTE',   'Acceso restringido a las ubicaciones asignadas: pedidos propios, stock/disponibilidad autorizada, incidencias propias.');

-- ROLLBACK (verificado: user_roles en 0003 referencia roles.id con
-- "on delete restrict" — hay que borrar user_roles antes que roles):
-- drop table if exists public.roles;
