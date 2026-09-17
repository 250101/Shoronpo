-- Exige una sesión AAL2 para cualquier cambio administrativo de acceso.

create or replace function public.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

revoke all on function public.is_admin_aal2() from public, anon;
grant execute on function public.is_admin_aal2() to authenticated;

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
  if new.is_active is distinct from old.is_active and not public.is_admin_aal2() then
    raise exception 'Se requiere ADMINISTRADOR con MFA verificado para cambiar el estado de un perfil.';
  end if;
  new.display_name = trim(both from new.display_name);
  return new;
end;
$$;

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_admin_aal2())
  with check (public.is_admin_aal2());

create or replace function public.grant_role(p_user_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id smallint;
begin
  if not public.is_admin_aal2() then
    raise exception 'Se requiere ADMINISTRADOR con MFA verificado para asignar roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nadie puede asignarse un rol a sí mismo.';
  end if;
  select id into v_role_id from public.roles where code = p_role_code;
  if v_role_id is null then raise exception 'Rol desconocido: %', p_role_code; end if;
  insert into public.user_roles (user_id, role_id)
  values (p_user_id, v_role_id)
  on conflict (user_id, role_id) do nothing;
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_aal2() then
    raise exception 'Se requiere ADMINISTRADOR con MFA verificado para revocar roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nadie puede quitarse un rol a sí mismo.';
  end if;
  delete from public.user_roles ur
  using public.roles r
  where ur.role_id = r.id and r.code = p_role_code and ur.user_id = p_user_id;
end;
$$;

revoke all on function public.grant_role(uuid, text) from public, anon;
revoke all on function public.revoke_role(uuid, text) from public, anon;
grant execute on function public.grant_role(uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, text) to authenticated;

