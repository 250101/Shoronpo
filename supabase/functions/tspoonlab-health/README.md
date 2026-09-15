# tspoonlab-health

Health check backend de solo lectura para la Fase 4.

Secretos requeridos en Supabase Edge Functions:

- `TSPOONLAB_REMEMBERME`: token de sesión de tSpoonLab.
- `SHORONPO_SYNC_TRIGGER_SECRET`: clave aleatoria independiente para autorizar invocaciones internas.

El endpoint sólo acepta `POST` con `x-shoronpo-sync-key`. Nunca devuelve ni registra tokens o payloads de tSpoonLab. Ante un `401` marca `public.tspoonlab_connector_status.status = 'AUTH_EXPIRED'`; la recuperación consiste en renovar el token localmente, actualizar el secreto y repetir el health check.

