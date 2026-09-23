-- Compatibilidad para proyectos donde 0030 se aplicó antes de ampliar
-- explícitamente el catálogo de orígenes del período.
alter table public.inventory_periods drop constraint inventory_periods_source_check;
alter table public.inventory_periods add constraint inventory_periods_source_check
check (source in ('APP','SHEETS_IMPORT','TSPOON_SNAPSHOT'));
