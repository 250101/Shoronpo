-- 0001_extensions_and_types.sql
-- Sistema Shoronpo — Fase 1, ronda de corrección técnica v2
-- PROPUESTA, NO EJECUTAR TODAVÍA.

create extension if not exists pgcrypto;

create type public.location_type as enum ('OBRADOR', 'RESTAURANTE');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'Trigger genérico: setea updated_at = now() en cada UPDATE. No es SECURITY DEFINER (no necesita privilegios elevados: sólo escribe la fila que ya está siendo modificada por quien tiene permiso de UPDATE).';

-- ROLLBACK (verificado: sin dependientes en este punto de la secuencia):
-- drop function if exists public.touch_updated_at();
-- drop type if exists public.location_type;
-- drop extension if exists pgcrypto;
