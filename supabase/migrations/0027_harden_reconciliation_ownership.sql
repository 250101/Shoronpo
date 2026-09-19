-- Una conciliación sólo puede ser creada o modificada por un usuario que
-- conserve, en ese momento, permisos de ADMINISTRADOR u OBRADOR para el local.
-- También evita que el cliente suplante created_by.

create or replace function public.enforce_reconciliation_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_reconciliation_actor() from public, anon, authenticated;

drop trigger if exists trg_inventory_reconciliations_actor
  on public.inventory_reconciliations;
create trigger trg_inventory_reconciliations_actor
  before insert or update on public.inventory_reconciliations
  for each row execute function public.enforce_reconciliation_actor();

drop policy if exists inventory_reconciliations_insert_authorized
  on public.inventory_reconciliations;
create policy inventory_reconciliations_insert_authorized
  on public.inventory_reconciliations for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.inventory_lines l
      join public.inventory_periods p on p.id = l.period_id
      where l.id = inventory_line_id
        and (
          public.is_admin()
          or (
            public.has_role('OBRADOR')
            and p.location_id in (select public.user_location_ids())
          )
        )
    )
  );

drop policy if exists inventory_reconciliations_update_authorized
  on public.inventory_reconciliations;
create policy inventory_reconciliations_update_authorized
  on public.inventory_reconciliations for update to authenticated
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and public.has_role('OBRADOR')
      and exists (
        select 1
        from public.inventory_lines l
        join public.inventory_periods p on p.id = l.period_id
        where l.id = inventory_line_id
          and p.location_id in (select public.user_location_ids())
      )
    )
  )
  with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and public.has_role('OBRADOR')
      and exists (
        select 1
        from public.inventory_lines l
        join public.inventory_periods p on p.id = l.period_id
        where l.id = inventory_line_id
          and p.location_id in (select public.user_location_ids())
      )
    )
  );

drop policy if exists inventory_reconciliations_delete_authorized
  on public.inventory_reconciliations;
create policy inventory_reconciliations_delete_authorized
  on public.inventory_reconciliations for delete to authenticated
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and public.has_role('OBRADOR')
      and exists (
        select 1
        from public.inventory_lines l
        join public.inventory_periods p on p.id = l.period_id
        where l.id = inventory_line_id
          and p.location_id in (select public.user_location_ids())
      )
    )
  );

