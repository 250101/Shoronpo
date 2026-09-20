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
3. Incorporar administración segura de usuarios y roles con MFA y SMTP propio. **MFA, invitación real, contraseña y roles completados; SMTP propio pendiente.**
4. Separar staging y producción, incluidos base, secretos, cron y URL. **Guardas de frontend completadas; proyecto productivo pendiente.**
5. Automatizar backups cifrados y validar restauraciones.
6. Retirar `localStorage` como estado paralelo de conciliaciones. **Completado.**
7. Separar pruebas e incidentes reales en el panel operativo.

## 2. Renderizado seguro del frontend — completado

- Los nombres de producto, familias, unidades, semanas y comentarios se escapan antes de insertarse como HTML.
- Los identificadores enviados desde controles dinámicos se codifican y ya no se interpolan como JavaScript sin protección.
- Se añadieron pruebas de regresión con cargas XSS para texto y atributos de acción.
- Los manejadores inline fueron reemplazados por delegación de eventos con `data-action`.
- El CSS y JavaScript se separaron en `styles.css` y `app.js`; la CSP ya bloquea scripts y atributos de script inline.
- `style-src` conserva temporalmente `unsafe-inline` sólo para estilos visuales heredados en atributos; no habilita ejecución de JavaScript.

## 3. Usuarios, roles y MFA — funcional; SMTP pendiente

- La migración `0026` está aplicada y exige una sesión `aal2` para asignar/revocar roles y activar/desactivar usuarios.
- La prueba directa confirmó `aal1 = false` y `aal2 = true` para la cuenta administradora.
- La función `admin-users` está desplegada sin exponer `service_role` al navegador; valida origen, JWT, rol ADMINISTRADOR y MFA.
- Las invitaciones admiten los roles cerrados `ADMINISTRADOR`, `DIRECCION`, `OBRADOR` y `RESTAURANTE`.
- El preflight CORS fue corregido y probado (`204`); origen no permitido devuelve `403` y ausencia de sesión devuelve `401`.
- El frontend incluye enrolamiento/desafío TOTP y una ficha exclusiva para administradores que permite invitar usuarios y asignar su rol inicial.
- La invitación real de `DIRECCION` fue validada de punta a punta: correo, establecimiento de contraseña, inicio de sesión y carga de las seis fichas de lectura.
- La sesión de Dirección no expone carga/cierre de inventario, edición de conciliaciones ni administración de usuarios. El panel Sistema ofrece sólo lectura operativa.
- La migración `0027` refuerza la defensa en base de datos: impide suplantar `created_by` y revoca la escritura sobre conciliaciones cuando el usuario deja de ser OBRADOR o pierde acceso al local.
- Se regularizó y verificó el historial remoto de migraciones `0001`–`0027`.
- Queda pendiente configurar SMTP propio para no depender del límite temporal del correo integrado de Supabase.

## 4. Fuente única de conciliaciones — completado

- Se eliminó la persistencia paralela en `localStorage`.
- Las conciliaciones se reconstruyen exclusivamente desde `inventory_reconciliations` al cargar el histórico.
- Las actualizaciones optimistas de pantalla se revierten si Supabase rechaza el alta o la baja.
- Una prueba de regresión impide reintroducir almacenamiento persistente local.

## 5. Separación staging/producción — en curso

- La configuración pública de Supabase se genera por entorno durante el build de Netlify.
- Los deploys de rama conservan el proyecto `shoronpo-dev` como staging.
- Un build de producción falla si faltan las variables o si intenta apuntar al proyecto de desarrollo.
- Las pruebas cubren staging, producción sin configuración, reutilización accidental de desarrollo y un proyecto productivo independiente.
- Pendiente: crear el proyecto Supabase productivo, aplicar migraciones, separar secretos/cron y cargar las variables productivas en Netlify.
- Proyecto productivo creado: `shoronpo-prod` (`krpiprwplhxrxlhzcuak`, `eu-west-2`).
- Esquema productivo aplicado y verificado vacío; cron y secretos permanecen deliberadamente desactivados.
- El despliegue real detectó y corrigió dos mezclas peligrosas entre bootstrap/esquema y activación operativa en `0008` y `0021`.
- Administrador inicial creado y autorizado; variables productivas de Netlify configuradas únicamente para producción.
- Supabase producción: `shoronpo-prod` (`krpiprwplhxrxlhzcuak`), aislado de staging.
- URL principal autorizada: `https://shoronpo.netlify.app`.
- Función `admin-users` desplegada con origen e invitaciones limitados al sitio productivo.
- Los cron y conectores operativos permanecen desactivados hasta su fase de activación.
