# Supabase: reconstrucción y recuperación

Este directorio contiene lo necesario para reconstruir el esquema y los datos iniciales de Shoronpo sin depender de Google Sheets ni Apps Script.

## Orden de reconstrucción

1. Aplicar `migrations/0001_extensions_and_types.sql` a `0007_audit_log.sql`, en orden.
2. Crear el primer usuario en Supabase Auth y completar manualmente la plantilla `migrations/0008_first_administrator_template.sql`.
3. Aplicar `migrations/0010_inventory_domain.sql`.
4. Cargar `seed/inventory_import.sql` una sola vez.
5. Ejecutar `tests/0010_inventory_domain_test.sql` en un entorno de pruebas, nunca sobre datos de producción activos.

La migración `0008` es deliberadamente una plantilla manual porque necesita el UUID real de un usuario creado en Auth.

## Estado de respaldo

El proyecto está actualmente en el plan Free de Supabase, que no incluye respaldos programados. Las migraciones y el seed permiten reconstruir el estado inicial importado, pero no sustituyen una copia periódica de los cambios posteriores.

Para producción se debe adoptar una de estas opciones:

- pasar a Pro para obtener respaldos diarios administrados; o
- ejecutar periódicamente un `supabase db dump`/`pg_dump` autenticado y guardar el archivo cifrado fuera del repositorio.

Nunca deben versionarse contraseñas de base de datos, tokens, claves `service_role` ni archivos de backup con datos reales.

## Conector tSpoonLab — Fase 4

La función `functions/tspoonlab-health` verifica el acceso de sólo lectura a tSpoonLab y actualiza `public.tspoonlab_connector_status`. El token vive exclusivamente en el secreto de Edge Functions `TSPOONLAB_REMEMBERME`; nunca se persiste en PostgreSQL ni se devuelve al frontend.

Si tSpoonLab responde `401`, el estado pasa a `AUTH_EXPIRED` y el proceso se detiene. La recuperación consiste en renovar el token desde el extractor local autorizado, actualizar el secreto y repetir el health check. La invocación exige además `SHORONPO_SYNC_TRIGGER_SECRET` mediante el header `x-shoronpo-sync-key`.

## Sincronización manual de existencias — Fase 5

`functions/tspoonlab-sync-stock` importa, en modo de sólo lectura, las existencias de los almacenes de tSpoonLab. Cada llamada exige el secreto interno y `x-idempotency-key`; repetir la misma clave devuelve la corrida existente y no duplica snapshots.

- `tspoon_sync_runs`: auditoría y resultado de cada corrida.
- `tspoon_sync_errors`: errores sanitizados, sin payloads ni credenciales.
- `tspoon_stock_snapshots`: cantidades normalizadas por almacén y producto.

La cantidad total se calcula como `quantityInventory + quantityInput + quantityOutput`, tratando cada `null` como ausencia/0 para el total pero conservando el `null` original en su columna. Ante `401`, la corrida falla de forma cerrada y el conector pasa a `AUTH_EXPIRED`; una corrida posterior correcta lo devuelve a `HEALTHY`.

## Rollback del frontend

El tag Git `pre-supabase-cutover-2026-09-15` conserva el frontend anterior en el commit `a52efc9`. Su Apps Script fue archivado después del corte y debe reactivarse explícitamente si alguna vez se utiliza ese rollback.

## Operación y alertas

Las sincronizaciones de stock, producciones y pedidos se ejecutan cada seis horas. El sistema detecta fallos, datos desactualizados y sesiones de tSpoonLab expiradas; los incidentes aparecen en el panel **Sistema** y se notifican por Telegram, incluyendo un único aviso de recuperación.

El procedimiento diario, la renovación de sesión, el modo manual y las responsabilidades están documentados en `docs/OPERATIONS_RUNBOOK.md`. La recuperación de datos y los ensayos de backup se describen en `docs/DISASTER_RECOVERY.md`.
