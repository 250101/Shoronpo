-- Cambio atómico del rol funcional de una cuenta existente.
-- Conserva la exigencia de ADMINISTRADOR activo con MFA (AAL2), impide
-- modificar la propia cuenta y bloquea RESTAURANTE durante el go-live.

create or replace function public.set_user_role(p_user_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id smallint;
begin
  if not public.is_admin_aal2() then
    raise exception 'Se requiere ADMINISTRADOR con MFA verificado para cambiar roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nadie puede cambiar su propio rol.';
  end if;
  if p_role_code not in ('ADMINISTRADOR', 'DIRECCION', 'OBRADOR') then
    raise exception 'Rol no permitido: %', p_role_code;
  end if;

  select id into v_role_id from public.roles where code = p_role_code;
  if v_role_id is null then raise exception 'Rol desconocido: %', p_role_code; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Usuario inexistente.';
  end if;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role_id) values (p_user_id, v_role_id);
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
