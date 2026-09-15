# Fase 5 — Sincronización manual de existencias

Estado: implementada y validada el 16-09-2026.

## Resultado

- Fuente: cuatro almacenes obtenidos mediante endpoints GET confirmados de tSpoonLab.
- Primera corrida: 4 almacenes, 149 registros, estado `SUCCEEDED`.
- Idempotencia: una segunda llamada con la misma clave reutilizó la corrida y no creó duplicados.
- Error forzado: un token deliberadamente inválido produjo `AUTH_EXPIRED` y detuvo la corrida.
- Recuperación: tras restaurar el secreto, la corrida volvió a completar 4 almacenes y 149 registros; el estado regresó a `HEALTHY`.
- Tests locales: 10/10 aprobados.

No se realizó ninguna escritura hacia tSpoonLab. No se almacenan payloads crudos ni credenciales. Las tablas de importación sólo admiten escritura con `service_role`; los clientes autenticados tienen lectura limitada por rol.

## Rollback

Desplegar una versión anterior o eliminar `tspoonlab-sync-stock` detiene nuevas importaciones. Los snapshots pertenecen a corridas identificables y pueden eliminarse por `run_id` mediante una intervención administrativa controlada. No existe nada que revertir en tSpoonLab.
