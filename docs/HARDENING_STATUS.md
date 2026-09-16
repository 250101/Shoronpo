# Endurecimiento funcional y de seguridad

Estado iniciado el 17-09-2026. El rediseño visual se realizará después de cerrar estos controles.

## 1. Integridad de sincronizaciones — completado

- Producciones: cabecera e ingredientes se reemplazan en una única transacción PostgreSQL.
- Pedidos: pedido, entregas y líneas se reemplazan en una única transacción PostgreSQL.
- Las RPC sólo pueden ejecutarse con `service_role`; `anon` y `authenticated` no tienen permiso.
- Un error en cualquier fila revierte la cabecera y todos sus detalles.
- Prueba de fallo forzado aprobada para ambos bloques: los datos anteriores permanecieron intactos.
- Validación real posterior: producciones `200` (73 registros actuales) y pedidos `200` (25 registros en la primera página).

## Próximos controles

1. Neutralizar contenido HTML no confiable y eliminar eventos inline.
2. Dividir el frontend monolítico y retirar `unsafe-inline` de la CSP.
3. Incorporar administración segura de usuarios y roles con MFA y SMTP propio.
4. Separar staging y producción, incluidos base, secretos, cron y URL.
5. Automatizar backups cifrados y validar restauraciones.
6. Retirar `localStorage` como estado paralelo de conciliaciones.
7. Separar pruebas e incidentes reales en el panel operativo.
