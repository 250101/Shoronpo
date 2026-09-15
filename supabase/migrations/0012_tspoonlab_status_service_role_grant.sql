-- La Edge Function usa service_role para registrar el estado sanitario.
-- RLS sigue bloqueando al cliente; esta concesion es exclusiva del backend.

grant select, insert, update on public.tspoonlab_connector_status to service_role;

