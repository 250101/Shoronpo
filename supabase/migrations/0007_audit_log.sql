-- 0007_audit_log.sql
-- Sistema Shoronpo — Fase 1 v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.
--
-- CORRECCIÓN 9: audit_log SÍ puede contener datos personales (nombres
-- visibles vía old_data/new_data de profiles, actor_id, asociaciones
-- usuario-ubicación) — se corrige la afirmación anterior de que no había
-- datos personales en el sistema. Se documenta minimización, acceso
-- restringido, retención y qué pasa si se borra un auth.users. Ver
-- docs/audit-strategy.md para el detalle completo; acá sólo el DDL.

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  location_id uuid references public.locations(id) on delete set null,
  result text not null default 'SUCCESS' check (result in ('SUCCESS', 'FAILURE')),
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_metadata_size check (metadata is null or pg_column_size(metadata) <= 8192),
  constraint audit_log_old_data_size check (old_data is null or pg_column_size(old_data) <= 16384),
  constraint audit_log_new_data_size check (new_data is null or pg_column_size(new_data) <= 16384)
);

comment on table public.audit_log is
  'Bitácora append-only. actor_id usa ON DELETE SET NULL (corrección 9): si se elimina un auth.users, la fila de auditoría se conserva (no se borra en cascada, perdería el registro histórico) pero deja de apuntar a un usuario inexistente — la fila queda como "actor desconocido/usuario eliminado", nunca se reasigna a otro usuario. Límites de tamaño en old_data/new_data/metadata (corrección 9: "prevención de que el backend guarde payloads completos arbitrarios") — un intento de insertar más de esos límites falla el INSERT en vez de dejar crecer la tabla sin control. NUNCA debe contener contraseñas, tokens, claves ni el payload completo de una tabla con columnas sensibles.';

create index idx_audit_log_entity on public.audit_log (entity, entity_id);
create index idx_audit_log_actor on public.audit_log (actor_id);
create index idx_audit_log_created_at on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_select_admin
  on public.audit_log
  for select
  to authenticated
  using (public.is_admin());

create policy audit_log_select_direccion
  on public.audit_log
  for select
  to authenticated
  using (public.has_role('DIRECCION'));

-- ── GRANTS (corrección 3) ──────────────────────────────────────────────
revoke all on public.audit_log from public;
revoke all on public.audit_log from anon;
grant select on public.audit_log to authenticated;
-- Sin insert/update/delete a "authenticated" ni a "anon", nunca. La única
-- vía de escritura es write_audit_log() (SECURITY DEFINER, disparada por
-- trigger) o el service_role del backend para eventos que no son un
-- cambio de fila 1:1 (ver docs/audit-strategy.md).

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_id text;
begin
  v_entity_id := (case when TG_OP = 'DELETE' then old.id else new.id end)::text;
  insert into public.audit_log (actor_id, action, entity, entity_id, old_data, new_data)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.write_audit_log() from public;
-- Sin GRANT EXECUTE a authenticated ni a anon: esta función existe
-- exclusivamente para ser invocada por los triggers de abajo. Un cliente
-- no puede llamarla como RPC ni aunque conociera su nombre — no tiene
-- privilegio de EXECUTE.

comment on function public.write_audit_log() is
  'Función de trigger, NO invocable directamente por un cliente (sin GRANT EXECUTE a authenticated/anon). Segura de adjuntar sólo a tablas SIN columnas sensibles: profiles, user_roles, locations, user_locations no tienen ninguna. Los límites de tamaño de la tabla (ver arriba) actúan como último resguardo si alguna tabla futura tuviera una columna inesperadamente grande.';

create trigger trg_audit_user_roles
  after insert or delete on public.user_roles
  for each row execute function public.write_audit_log();

create trigger trg_audit_user_locations
  after insert or delete on public.user_locations
  for each row execute function public.write_audit_log();

comment on trigger trg_audit_user_roles on public.user_roles is
  'Sin "or update": user_roles ya no admite UPDATE (corrección 5) — sólo INSERT (grant_role) y DELETE (revoke_role) pueden ocurrir.';

create trigger trg_audit_locations
  after insert or update or delete on public.locations
  for each row execute function public.write_audit_log();

-- write_audit_log() asume que la tabla auditada tiene una columna `id`
-- (cierto para user_roles, user_locations, locations). `profiles` tiene
-- clave primaria `user_id`, no `id` -- usar write_audit_log() tal cual
-- acá haría fallar la función con "record has no field id" en cada
-- activación/desactivación (encontrado por ejecución real de pruebas
-- locales contra Postgres, no sólo por inspección estática -- ver
-- test-plan-permissions.md, sección "hallazgos"). Se agrega una variante
-- específica para profiles en vez de generalizar write_audit_log() con SQL
-- dinámico (más simple, más auditable, sin riesgo de inyección de
-- identificadores).
create or replace function public.write_audit_log_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, old_data, new_data)
  values (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    coalesce(new.user_id, old.user_id)::text,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.write_audit_log_profiles() from public;
-- Mismo criterio que write_audit_log(): sin GRANT EXECUTE a nadie, sólo
-- invocable por su trigger.

comment on function public.write_audit_log_profiles() is
  'Variante de write_audit_log() para tablas cuya clave primaria no se llama "id" -- en este diseño, únicamente public.profiles (PK: user_id). No SECURITY DEFINER innecesariamente amplia: misma justificación que write_audit_log() (necesita INSERT en audit_log, tabla sin GRANT de escritura para nadie más).';

create trigger trg_audit_profiles_activation
  after update of is_active on public.profiles
  for each row execute function public.write_audit_log_profiles();

-- ROLLBACK (verificado, en orden inverso):
-- drop trigger if exists trg_audit_profiles_activation on public.profiles;
-- drop function if exists public.write_audit_log_profiles();
-- drop trigger if exists trg_audit_locations on public.locations;
-- drop trigger if exists trg_audit_user_locations on public.user_locations;
-- drop trigger if exists trg_audit_user_roles on public.user_roles;
-- drop function if exists public.write_audit_log();
-- drop table if exists public.audit_log;
