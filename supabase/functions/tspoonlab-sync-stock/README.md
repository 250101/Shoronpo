# tspoonlab-sync-stock

Sincronización manual y de sólo lectura del bloque de existencias de la Fase 5.

Acepta únicamente `POST` con `x-shoronpo-sync-key` y una clave única `x-idempotency-key`. Repetir la misma clave no crea otro snapshot. El token de tSpoonLab permanece en Supabase Secrets y nunca se devuelve ni se registra.

La corrida queda auditada en `tspoon_sync_runs`; los fallos sanitizados en `tspoon_sync_errors`; los datos normalizados en `tspoon_stock_snapshots`. Un `401` detiene la corrida y marca el conector como `AUTH_EXPIRED`.

