# Protocolo operativo — Shoronpo

Estado: integración validada el 16-09-2026. Zona horaria operativa: `Europe/Madrid`.

## Funcionamiento normal

- Stock se sincroniza cada seis horas, en el minuto 17.
- Producciones se sincronizan cada seis horas, en el minuto 32.
- Pedidos se sincronizan cada seis horas, en el minuto 47.
- Los incidentes se recalculan cada quince minutos.
- Telegram revisa alertas en los minutos 2, 17, 32 y 47 de cada hora.
- El panel **Sistema** muestra la última ejecución, el estado del conector y los incidentes abiertos.

## Qué hacer cuando llega una alerta

1. Abrir **Sistema** y anotar bloque, mensaje y hora.
2. No lanzar varias sincronizaciones seguidas ni restaurar la base de datos.
3. Si el incidente es `AUTH_EXPIRED`, renovar únicamente la sesión de tSpoonLab con el procedimiento autorizado, actualizar `TSPOONLAB_REMEMBERME` y ejecutar el health check.
4. Si es `SYNC_FAILED`, revisar la ejecución correspondiente y sus errores sanitizados. Corregir la causa antes de reintentar.
5. Si es `SYNC_STALE`, verificar primero pg_cron y el estado de Supabase; ejecutar una sincronización manual sólo si el programador no se recupera.
6. Confirmar una nueva ejecución `SUCCEEDED`. El sistema cerrará el incidente y Telegram enviará un único mensaje de recuperación.
7. Registrar quién intervino, causa, hora de recuperación y cambio realizado.

## Sesión de tSpoonLab expirada

La sesión expirada no altera ni elimina datos existentes: detiene las nuevas importaciones de forma cerrada.

1. Iniciar sesión manualmente en tSpoonLab con la cuenta autorizada.
2. Obtener el valor de sesión mediante el extractor local aprobado. No enviarlo por chat ni guardarlo en Git.
3. Reemplazar el secreto `TSPOONLAB_REMEMBERME` en Supabase Edge Functions.
4. Ejecutar `tspoonlab-health` y confirmar `HEALTHY`.
5. Ejecutar una sincronización manual del bloque afectado con una clave de idempotencia nueva.
6. Confirmar `SUCCEEDED`, datos recientes en el panel y aviso de recuperación en Telegram.

## Si Supabase o el conector no están disponibles

- Conservar la operación manual en tSpoonLab y no inventar existencias en Shoronpo.
- Registrar temporalmente los movimientos críticos en el formulario/planilla manual designado, con fecha, hora, ubicación, producto, cantidad y responsable.
- No importar esa planilla directamente en producción. Cuando el servicio vuelva, comparar contra tSpoonLab, resolver diferencias y cargar sólo mediante un procedimiento de importación probado en staging.
- Para una pérdida o alteración de datos, seguir `docs/DISASTER_RECOVERY.md`; nunca restaurar encima de producción.

## Backup manual en plan Free

Ejecutar `scripts/backup_supabase.ps1 -ProjectRef krpiprwplhxrxlhzcuak -Environment production` todos los lunes y antes/después de migraciones o importaciones masivas. Verificar con `scripts/verify_backup.ps1`, conservar ocho copias semanales y doce mensuales, y mantener una segunda copia cifrada fuera del equipo. Una vez al mes restaurar con `scripts/restore_supabase_test.ps1` en un proyecto temporal vacío, validar conteos, RLS y permisos, y documentar el resultado. RPO normal: 7 días; RTO objetivo: 4 horas.

## Responsabilidades

- Responsable del obrador: confirma el impacto operativo y mantiene el registro manual durante una caída.
- Administrador de Shoronpo: renueva la sesión, revisa sincronizaciones y valida la recuperación.
- Responsable técnico: corrige funciones, migraciones o permisos y prueba primero fuera de producción.
- Nadie debe compartir tokens, claves de base de datos o `service_role`, ni borrar proyectos o restaurar producción sin un ensayo previo.

## Evidencia de cierre

La prueba integral de Telegram fue aprobada el 16-09-2026: alerta enviada (`sent: 1`), recuperación enviada (`sent: 1`) y repetición sin duplicado (`sent: 0`). El incidente controlado quedó `RESOLVED` con ambas marcas de entrega.
