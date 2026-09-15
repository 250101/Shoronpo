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

## Rollback del frontend

El tag Git `pre-supabase-cutover-2026-09-15` conserva el frontend anterior en el commit `a52efc9`. Su Apps Script fue archivado después del corte y debe reactivarse explícitamente si alguna vez se utiliza ese rollback.
