-- 0005_helper_functions_and_policies.sql
-- Sistema Shoronpo — Fase 1 v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.
--
-- VERIFICACIÓN DE DEPENDENCIAS (corrección 1): a esta altura de la
-- secuencia ya existen public.roles (0002), public.user_roles (0003) y
-- public.profiles (0004) — las tres tablas que las funciones de este
-- archivo necesitan consultar. Ninguna función de este archivo referencia
-- public.locations ni public.user_locations (esas se crean recién en
-- 0006); user_location_ids() se define en 0006, no acá, exactamente por
-- eso. Se puede correr `set check_function_bodies = on;` (el valor por
-- default de Postgres) al aplicar esta migración sin que falle: no se
-- desactiva esa verificación en ningún punto de esta secuencia.
--
-- CÓMO SE EVITA LA RECURSIÓN: has_role()/is_admin()/is_active_user() son
-- SECURITY DEFINER, propiedad del rol que corre las migraciones (dueño de
-- las tablas — normalmente "postgres" en Supabase), sin FORCE ROW LEVEL
-- SECURITY en ninguna tabla involucrada. Por eso, la consulta interna de
-- estas funciones contra profiles/user_roles/roles no vuelve a evaluar las
-- policies de esas tablas — corta el ciclo. `set search_path = ''` (no
-- 'public') fuerza a calificar cada nombre con su esquema explícito
-- (public.profiles, no profiles a secas) — más estricto que fijar
-- search_path a 'public', y elimina cualquier ambigüedad de qué objeto se
-- está consultando (protección adicional contra "object shadowing").

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.is_active = true
  );
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

comment on function public.is_active_user() is
  'true si hay un usuario autenticado (auth.uid() no nulo) Y su perfil existe con is_active = true. SECURITY DEFINER: propietario postgres (dueño de profiles), sin FORCE RLS en profiles — no recursiona. Invocable directamente por un cliente autenticado (es un simple booleano de sí mismo, no expone datos de terceros); usada también internamente por has_role()/is_admin().';

create or replace function public.has_role(check_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = check_role
  );
$$;

revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated;

comment on function public.has_role(text) is
  'true si el usuario autenticado actual está ACTIVO (is_active_user()) y tiene el rol indicado. Un usuario desactivado nunca devuelve true acá, aunque conserve filas en user_roles y un JWT válido — corrección 2. SECURITY DEFINER, mismo mecanismo anti-recursión que is_active_user(). Invocable directamente por un cliente autenticado: no expone nada que el propio usuario no supiera ya (si tiene o no un rol dado).';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('ADMINISTRADOR');
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── Ahora que is_admin() existe, se habilita el cambio de is_active en
-- profiles exclusivamente para ADMINISTRADOR (create or replace sobre la
-- función ya creada en 0004 — no se recrea la tabla ni el trigger, sólo
-- se reemplaza el cuerpo de la función que el trigger ya tiene enganchado).
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id no es editable.';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at no es editable.';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_admin() then
    raise exception 'Solo un ADMINISTRADOR puede cambiar el estado activo/inactivo de un perfil.';
  end if;
  new.display_name = trim(both from new.display_name);
  return new;
end;
$$;

-- Esta función ahora SÍ necesita ser SECURITY DEFINER (llama a is_admin(),
-- que a su vez consulta user_roles/profiles) — se recrea con esa cláusula,
-- reemplazando la versión no-definer de 0004.
revoke all on function public.protect_profile_admin_fields() from public;
-- Sin GRANT EXECUTE directo a authenticated: esta función sólo la invoca
-- el trigger trg_profiles_protect_admin_fields (ya enganchado desde 0004),
-- nunca un cliente llamándola como RPC.

-- ── Políticas de ADMINISTRADOR sobre profiles (diferidas desde 0004) ────
create policy profiles_select_admin_direccion
  on public.profiles
  for select
  to authenticated
  using (public.is_admin() or public.has_role('DIRECCION'));

create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- El GRANT de columna de 0004 (update(display_name) a authenticated) sigue
-- vigente para el caso "propio usuario". Para que ADMINISTRADOR pueda
-- además cambiar is_active vía esta policy, hace falta el privilegio de
-- columna correspondiente:
grant update (is_active) on public.profiles to authenticated;
-- Nota: este GRANT por sí solo NO le da a un usuario cualquiera permiso de
-- tocar is_active — la policy profiles_update_admin exige is_admin() en el
-- USING/WITH CHECK, y el trigger protect_profile_admin_fields() vuelve a
-- validar is_admin() a nivel de fila. Son tres capas independientes
-- (grant de columna + policy de fila + trigger) que tienen que coincidir
-- las tres para que el cambio de is_active se acepte.

-- ── Política de ADMINISTRADOR sobre user_roles (diferida desde 0003) ────
create policy user_roles_select_admin
  on public.user_roles
  for select
  to authenticated
  using (public.is_admin());

-- ── grant_role() / revoke_role() (corrección 5) ─────────────────────────
-- Única vía de escritura sobre user_roles. No aceptan granted_by ni
-- granted_at como parámetro — ambos siempre se fuerzan a auth.uid()/now()
-- dentro de la función, sin importar qué mande el cliente. Validan
-- is_admin() y el auto-otorgamiento (nadie se asigna/quita un rol a sí
-- mismo, ni siquiera un ADMINISTRADOR) de forma interna, ADEMÁS de que la
-- tabla no tiene ningún GRANT de INSERT/DELETE para "authenticated" (0003)
-- — es decir, incluso si esta función no existiera, PostgREST ya rechazaría
-- cualquier intento de escritura directa por falta de privilegio.
create or replace function public.grant_role(p_user_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id smallint;
begin
  if not public.is_admin() then
    raise exception 'Sólo un ADMINISTRADOR puede asignar roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nadie puede asignarse un rol a sí mismo, ni siquiera un ADMINISTRADOR.';
  end if;

  select id into v_role_id from public.roles where code = p_role_code;
  if v_role_id is null then
    raise exception 'Rol desconocido: %', p_role_code;
  end if;

  insert into public.user_roles (user_id, role_id)
  values (p_user_id, v_role_id)
  on conflict (user_id, role_id) do nothing;
  -- granted_by/granted_at los pone el trigger force_granted_fields (0003)
  -- con auth.uid()/now() reales, no un valor que esta función pase.
end;
$$;

revoke all on function public.grant_role(uuid, text) from public;
grant execute on function public.grant_role(uuid, text) to authenticated;

create or replace function public.revoke_role(p_user_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Sólo un ADMINISTRADOR puede revocar roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nadie puede quitarse un rol a sí mismo, ni siquiera un ADMINISTRADOR.';
  end if;

  delete from public.user_roles ur
  using public.roles r
  where ur.role_id = r.id
    and r.code = p_role_code
    and ur.user_id = p_user_id;
end;
$$;

revoke all on function public.revoke_role(uuid, text) from public;
grant execute on function public.revoke_role(uuid, text) to authenticated;

comment on function public.grant_role(uuid, text) is
  'RPC administrativa. Propietario esperado: el rol de las migraciones (postgres). Ejecutable por: cualquier "authenticated" a nivel de GRANT, pero internamente rechaza si no es ADMINISTRADOR o si el destino es el propio caller — la autorización real está adentro de la función, no en el GRANT. Toca: user_roles (INSERT). NO puede invocarse por trigger/policy — está pensada para ser llamada directamente por el backend en nombre de un ADMINISTRADOR autenticado.';

-- ROLLBACK (verificado: grant_role/revoke_role no tienen dependientes;
-- las policies de profiles/user_roles agregadas acá no tienen dependientes
-- fuera de este archivo):
-- drop function if exists public.revoke_role(uuid, text);
-- drop function if exists public.grant_role(uuid, text);
-- revoke update (is_active) on public.profiles from authenticated;
-- drop policy if exists user_roles_select_admin on public.user_roles;
-- drop policy if exists profiles_update_admin on public.profiles;
-- drop policy if exists profiles_select_admin_direccion on public.profiles;
-- drop function if exists public.is_admin();
-- drop function if exists public.has_role(text);
-- drop function if exists public.is_active_user();
-- (protect_profile_admin_fields() vuelve a su versión de 0004 sólo si se
-- hace rollback de 0004 también — hacer rollback de 0005 sola deja esa
-- función en un estado que referencia is_admin(); no cortar 0005 sin
-- también revertir 0004 si se necesita ese caso.)
