# Endurecimiento funcional y de seguridad

Estado iniciado el 17-09-2026. El rediseño visual se realizará después de cerrar estos controles.

## 1. Integridad de sincronizaciones — completado

- Producciones: cabecera e ingredientes se reemplazan en una única transacción PostgreSQL.
- Pedidos: pedido, entregas y líneas se reemplazan en una única transacción PostgreSQL.
- Las RPC sólo pueden ejecutarse con `service_role`; `anon` y `authenticated` no tienen permiso.
- Un error en cualquier fila revierte la cabecera y todos sus detalles.
- Prueba de fallo forzado aprobada para ambos bloques: los datos anteriores permanecieron intactos.
- Validación real posterior: producciones `200` (73 registros actuales) y pedidos `200` (342 registros procesados).
- La validación descubrió que pedidos tenía más de una página; ahora recorre todas las páginas (máximo defensivo: 500) antes de confirmar la corrida. La prueba completa devolvió `hasMore: false`.

## Próximos controles

1. Neutralizar contenido HTML no confiable y eliminar eventos inline. **Completado.**
2. Dividir el frontend monolítico y retirar `unsafe-inline` de scripts en la CSP. **Completado.**
3. Incorporar administración segura de usuarios y roles con MFA y SMTP propio.
4. Separar staging y producción, incluidos base, secretos, cron y URL.
5. Automatizar backups cifrados y validar restauraciones.
6. Retirar `localStorage` como estado paralelo de conciliaciones.
7. Separar pruebas e incidentes reales en el panel operativo.

## 2. Renderizado seguro del frontend — completado

- Los nombres de producto, familias, unidades, semanas y comentarios se escapan antes de insertarse como HTML.
- Los identificadores enviados desde controles dinámicos se codifican y ya no se interpolan como JavaScript sin protección.
- Se añadieron pruebas de regresión con cargas XSS para texto y atributos de acción.
- Los manejadores inline fueron reemplazados por delegación de eventos con `data-action`.
- El CSS y JavaScript se separaron en `styles.css` y `app.js`; la CSP ya bloquea scripts y atributos de script inline.
- `style-src` conserva temporalmente `unsafe-inline` sólo para estilos visuales heredados en atributos; no habilita ejecución de JavaScript.
