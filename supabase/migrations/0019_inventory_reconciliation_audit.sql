-- Fase 8: trazabilidad de altas, cambios y bajas de conciliaciones.

drop trigger if exists trg_audit_inventory_reconciliations
  on public.inventory_reconciliations;

create trigger trg_audit_inventory_reconciliations
  after insert or update or delete on public.inventory_reconciliations
  for each row execute function public.write_audit_log();

comment on trigger trg_audit_inventory_reconciliations
  on public.inventory_reconciliations is
  'Registra INSERT/UPDATE/DELETE con auth.uid() como actor. La tabla audit_log permanece append-only y sólo visible para ADMINISTRADOR y DIRECCION.';

