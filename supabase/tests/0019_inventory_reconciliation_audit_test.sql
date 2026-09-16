begin;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.inventory_reconciliations'::regclass
      and tgname = 'trg_audit_inventory_reconciliations'
      and not tgisinternal
  ) then
    raise exception 'falta el trigger de auditoria de conciliaciones';
  end if;
end;
$$;

-- La prueba funcional usa una fila temporal y se revierte por completo.
do $$
declare
  v_line_id bigint;
  v_reconciliation_id uuid := gen_random_uuid();
begin
  select id into v_line_id from public.inventory_lines limit 1;
  if v_line_id is null then
    raise notice 'sin lineas de inventario: se omite la prueba funcional';
    return;
  end if;

  insert into public.inventory_reconciliations
    (id, inventory_line_id, cause, quantity, comment, occurred_at)
  values
    (v_reconciliation_id, v_line_id, 'TEST_AUDIT', 0.01, 'fila temporal', now());

  update public.inventory_reconciliations
    set comment = 'fila temporal actualizada'
    where id = v_reconciliation_id;

  delete from public.inventory_reconciliations where id = v_reconciliation_id;

  if (select count(*) from public.audit_log
      where entity = 'inventory_reconciliations'
        and entity_id = v_reconciliation_id::text) <> 3 then
    raise exception 'se esperaban tres eventos de auditoria';
  end if;
end;
$$;

rollback;
