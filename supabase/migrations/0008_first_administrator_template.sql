-- 0008_first_administrator_template.sql
-- Sistema Shoronpo — Fase 1 v2
-- PLANTILLA, NO ES UNA MIGRACIÓN AUTOMÁTICA. NO EJECUTAR TODAVÍA.
-- No contiene ningún email ni UUID real — <<PLACEHOLDER>> se reemplaza a
-- mano, una sola vez, por la persona que hace el bootstrap.
--
-- CORRECCIÓN 8: bootstrap del primer ADMINISTRADOR. El propio modelo
-- impide que un usuario se asigne su rol (grant_role() rechaza
-- p_user_id = auth.uid(), y no hay ningún otro camino de escritura sobre
-- user_roles) — así que el PRIMERíSIMO administrador no puede crearse
-- llamando a grant_role() desde la aplicación, porque en ese momento no
-- existe ningún ADMINISTRADOR que pueda invocarla. Se resuelve con una
-- operación manual, fuera de RLS, ejecutada UNA SOLA VEZ.
--
-- CÓMO SE EJECUTA (procedimiento, no automatizado por esta migración):
--   1. Crear el usuario en Supabase Auth normalmente (panel de Supabase,
--      "Add user", o el flujo de signup normal de la app) con su email
--      real. Anotar el UUID que Supabase le asigna (columna auth.users.id).
--   2. Abrir el SQL Editor de Supabase CONECTADO COMO EL ROL DE
--      MIGRACIONES (postgres) — no como "authenticated" ni con la anon
--      key. El SQL Editor del panel de Supabase corre como postgres por
--      defecto, que bypassea RLS: es la única forma legítima de insertar
--      la primera fila de user_roles sin pasar por grant_role().
--   3. Reemplazar <<PLACEHOLDER_UUID_PRIMER_ADMIN>> abajo por el UUID real
--      (nunca pegar un email ni un UUID real en este archivo versionado —
--      copiarlo directo del panel de Supabase al SQL Editor, sin guardarlo
--      en ningún archivo del repositorio).
--   4. Ejecutar SOLO el bloque de abajo, una vez.
--   5. Verificar (paso de verificación incluido abajo).
--   6. Repetir el procedimiento para un SEGUNDO administrador de respaldo
--      (pedido explícito: nunca dejar un único ADMINISTRADOR activo — ver
--      D17 en DECISIONS.md, nadie puede modificar su propio rol, ni
--      siquiera un admin, así que sin un segundo admin no hay forma de
--      recuperar el acceso si el primero queda inhabilitado).

do $$
declare
  v_user_id uuid := '<<PLACEHOLDER_UUID_PRIMER_ADMIN>>'::uuid;
  v_role_id smallint;
begin
  -- Verificación de precondición: el usuario debe existir en auth.users
  -- (si no existe, el paso 1 del procedimiento no se hizo).
  if not exists (select 1 from auth.users where id = v_user_id) then
    raise exception 'No existe ningún auth.users con ese UUID. Completá el paso 1 del procedimiento antes de correr esto.';
  end if;

  -- Verificación de precondición: no debe haber YA un ADMINISTRADOR
  -- (si ya hay uno, usá grant_role() desde la aplicación en vez de este
  -- bootstrap manual — este archivo es sólo para el primero).
  select r.id into v_role_id from public.roles r where r.code = 'ADMINISTRADOR';
  if exists (
    select 1 from public.user_roles ur where ur.role_id = v_role_id
  ) then
    raise exception 'Ya existe al menos un ADMINISTRADOR. No uses este bootstrap manual — usá grant_role() desde la aplicación, autenticado como un ADMINISTRADOR existente.';
  end if;

  insert into public.user_roles (user_id, role_id, granted_by, granted_at)
  values (v_user_id, v_role_id, v_user_id, now());
  -- granted_by = el propio usuario es la ÚNICA excepción de todo el
  -- sistema a "nadie se autoasigna" — documentada, auditable (queda en
  -- audit_log vía el trigger igual que cualquier otro INSERT en
  -- user_roles) y ejecutada por una persona con acceso directo a la base,
  -- no por la aplicación. El trigger force_granted_fields() de 0003
  -- normalmente pisaría cualquier granted_by que se mande — pero ese
  -- trigger fuerza auth.uid(), y al correr esto desde el SQL Editor como
  -- "postgres" (no como un usuario autenticado de la aplicación),
  -- auth.uid() es NULL, así que granted_by terminaría en NULL si no se
  -- pasa explícito acá. Se documenta esta particularidad para que quien
  -- ejecute el bootstrap no se sorprenda si granted_by no queda con el
  -- valor que puso en el INSERT — depende de cómo se conecte exactamente
  -- el SQL Editor en la cuenta real de Supabase; VERIFICAR el resultado
  -- con el paso 5 de abajo antes de dar el bootstrap por terminado.

  raise notice 'Primer ADMINISTRADOR asignado: %', v_user_id;
end $$;

-- Paso 5 — verificación (correr después del bloque de arriba):
-- select ur.user_id, r.code, ur.granted_by, ur.granted_at
-- from public.user_roles ur
-- join public.roles r on r.id = ur.role_id
-- where r.code = 'ADMINISTRADOR';
-- Debe devolver exactamente una fila con el UUID esperado.

-- Paso 6 — segundo administrador de respaldo: UNA VEZ que el primero
-- existe y está verificado, el segundo YA NO necesita este archivo — se
-- crea normalmente desde la aplicación, autenticado como el primer
-- ADMINISTRADOR, llamando a:
--   select public.grant_role('<<uuid del segundo usuario>>', 'ADMINISTRADOR');
-- Este es el camino normal (grant_role, con auditoría automática vía
-- trigger) — el bootstrap manual de este archivo es EXCLUSIVO para
-- cuando no existe ningún administrador todavía.

-- Este archivo no tiene ROLLBACK genérico con placeholder — el rollback
-- de una asignación puntual es, una vez reemplazado el UUID real:
-- delete from public.user_roles where user_id = '<<UUID>>' and role_id =
--   (select id from public.roles where code = 'ADMINISTRADOR');
