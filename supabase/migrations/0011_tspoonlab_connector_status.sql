-- Fase 4: estado operativo del conector tSpoonLab.
-- Nunca se almacena aqui el token rememberme ni respuestas de tSpoonLab.

create table public.tspoonlab_connector_status (
  singleton boolean primary key default true check (singleton),
  status text not null default 'NOT_CONFIGURED'
    check (status in ('NOT_CONFIGURED', 'HEALTHY', 'AUTH_EXPIRED', 'FORBIDDEN', 'RATE_LIMITED', 'UPSTREAM_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tspoonlab_connector_status enable row level security;
alter table public.tspoonlab_connector_status force row level security;

revoke all on table public.tspoonlab_connector_status from anon, authenticated;
grant select on table public.tspoonlab_connector_status to authenticated;

create policy tspoonlab_connector_status_admin_read
on public.tspoonlab_connector_status
for select
to authenticated
using (public.has_role('ADMINISTRADOR'));

insert into public.tspoonlab_connector_status (singleton, status)
values (true, 'NOT_CONFIGURED');

comment on table public.tspoonlab_connector_status is
  'Estado sanitario del conector; no contiene credenciales ni payloads de tSpoonLab.';

