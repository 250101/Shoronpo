-- 0004_profiles.sql
-- Sistema Shoronpo — Fase 1 v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.
--
-- Se crea ANTES que las funciones auxiliares (0005) a propósito:
-- is_active_user() necesita esta tabla, y has_role()/is_admin() (0005)
-- incorporan is_active_user() en su definición — por lo tanto profiles
-- tiene que existir antes de que exista cualquiera de esas tres funciones.
-- Las policies de ADMINISTRADOR sobre profiles (ver más abajo) se agregan
-- recién en 0005, una vez que is_admin() existe — mismo patrón de
-- "bootstrapping en dos pasos" ya usado para user_roles en v1/0003.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint display_name_not_blank check (length(trim(both from display_name)) > 0),
  constraint display_name_max_length check (char_length(display_name) <= 120)
);

comment on table public.profiles is
  'Perfil propio de Shoronpo, 1:1 con auth.users. El rol NO vive acá (vive en user_roles). Sólo display_name es editable por el propio usuario — is_active/user_id/created_at/updated_at están protegidos (ver GRANTS de columna y trigger más abajo).';

-- display_name: sin vacíos ni sólo-espacios (constraint arriba compara con
-- trim()), longitud máxima razonable para una UI (120 caracteres — cubre
-- nombres largos con apellidos compuestos, evita abuso de payload). No se
-- restringe el charset: nombres reales usan tildes, ñ, y otros caracteres
-- Unicode válidos — limitar a ASCII excluiría nombres reales.

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

-- Política de UPDATE a nivel de fila: permite la operación sólo sobre la
-- propia fila. La restricción de QUÉ COLUMNA se puede tocar no es cosa de
-- RLS (RLS es por fila, no por columna) — se resuelve con GRANT de columna
-- (más abajo) + el trigger protect_profile_admin_fields, en dos capas.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Sin policy de INSERT para authenticated/anon: sólo el trigger
-- handle_new_user() (SECURITY DEFINER) inserta, al registrarse en Auth.
-- Sin policy de DELETE: nunca se borra un perfil, se desactiva.

create trigger trg_profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Protección de columnas administrativas: is_active sólo lo cambia
-- ADMINISTRADOR (se valida contra is_admin() una vez que exista, ver nota
-- abajo); user_id/created_at nunca cambian tras el INSERT inicial;
-- updated_at siempre lo pone el trigger de arriba, nunca el cliente.
--
-- NOTA DE ORDEN: esta función se define ACÁ (0004) sin la validación de
-- is_admin() todavía (is_admin() no existe hasta 0005) — en esta versión
-- inicial, bloquea CUALQUIER cambio de is_active/user_id/created_at (nadie
-- puede tocarlos, ni siquiera un admin). En 0005, una vez que is_admin()
-- existe, se hace `create or replace function` de esta misma función para
-- permitirle a is_active exclusivamente a un ADMINISTRADOR. Esto no dura
-- "una ventana insegura": al revés, en este archivo la columna queda TOTAL
-- Y TEMPORALMENTE más restringida (nadie la cambia) hasta que 0005 la abre
-- selectivamente para ADMINISTRADOR — nunca al revés.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id no es editable.';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at no es editable.';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'is_active no es editable todavía en esta migración (se habilita para ADMINISTRADOR en 0005).';
  end if;
  -- Saneamiento de display_name además del CHECK de tabla: recorta
  -- espacios al inicio/fin antes de guardar (el CHECK ya rechaza vacíos,
  -- esto normaliza lo que efectivamente se persiste).
  new.display_name = trim(both from new.display_name);
  return new;
end;
$$;

create trigger trg_profiles_protect_admin_fields
  before update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- ── GRANTS de columna (corrección 6) ───────────────────────────────────
-- SELECT de la fila completa sí (RLS ya limita a "propia fila" o, para
-- ADMINISTRADOR/DIRECCIÓN, se resuelve en 0005). Para UPDATE, se otorga a
-- nivel de COLUMNA solamente display_name — no is_active, no user_id, no
-- created_at, no updated_at. Esto es una segunda capa independiente del
-- trigger: aunque alguien lograra construir un UPDATE que intente tocar
-- is_active, PostgreSQL rechaza el UPDATE por falta de privilegio de
-- columna ANTES de que el trigger llegue a evaluarse.
revoke all on public.profiles from public;
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
-- Sin insert/delete a "authenticated": el INSERT es sólo por trigger
-- (handle_new_user, SECURITY DEFINER) y no hay DELETE nunca.

-- Crea el perfil automáticamente al registrarse en Supabase Auth.
-- display_name sale de raw_user_meta_data->>'display_name' si vino en el
-- signup, o si no, del prefijo del email — en ambos casos SANEADO antes de
-- guardar: recortado de espacios, truncado a 120 caracteres, y si queda
-- vacío después de recortar, se usa 'Usuario' como valor de emergencia (el
-- CHECK de la tabla rechazaría un insert con string vacío, así que esta
-- función nunca puede fallar por un display_name vacío en el metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));
  v_display_name := trim(both from v_display_name);
  v_display_name := left(v_display_name, 120);
  if v_display_name = '' then
    v_display_name := 'Usuario';
  end if;

  insert into public.profiles (user_id, display_name)
  values (new.id, v_display_name);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
-- Sin GRANT EXECUTE a authenticated/anon: esta función sólo la invoca el
-- trigger sobre auth.users, nunca un cliente directamente (ver
-- fase1-v2/docs/security-definer-hardening.md, tabla de funciones).

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ROLLBACK (verificado: handle_new_user() está referenciada únicamente
-- por el trigger on_auth_user_created; protect_profile_admin_fields() y
-- touch_updated_at() únicamente por sus propios triggers sobre profiles):
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop trigger if exists trg_profiles_protect_admin_fields on public.profiles;
-- drop function if exists public.protect_profile_admin_fields();
-- drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
-- drop table if exists public.profiles;
