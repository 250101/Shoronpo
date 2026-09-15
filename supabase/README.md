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

## Rollback del frontend

El tag Git `pre-supabase-cutover-2026-09-15` conserva el frontend anterior en el commit `a52efc9`. Su Apps Script fue archivado después del corte y debe reactivarse explícitamente si alguna vez se utiliza ese rollback.
