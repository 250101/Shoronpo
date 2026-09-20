# Fase 2 — Correo transaccional y ciclo de usuarios

## Objetivo

Invitaciones, recuperación y cambio de contraseña confiables, sin depender del SMTP de prueba de Supabase, con administración protegida por MFA y mensajes que no revelen si una cuenta existe.

## Estado auditado

- `site_url` y las redirecciones autorizadas apuntan al deploy de staging.
- La confirmación de email está activa.
- TOTP está habilitado para enrolamiento y verificación.
- El SMTP predeterminado de Supabase sigue activo; está limitado y no es apto para producción.
- Invitación real, establecimiento de contraseña e inicio de sesión con rol `DIRECCION` ya fueron validados.
- La recuperación ahora diferencia límite de frecuencia, indisponibilidad y errores de entrada sin enumerar cuentas.

## Proveedor recomendado

1. **Resend con dominio propio**: primera opción. Tiene relay SMTP, autenticación DKIM/SPF/DMARC y un plan gratuito suficiente para el volumen operativo previsto.
2. **Brevo o SMTP corporativo**: alternativa si Shoronpo ya dispone de un remitente verificado allí.
3. **Gmail con contraseña de aplicación**: sólo contingencia temporal; no es la opción recomendada para correo operativo.

## Datos necesarios para completar SMTP

- Dominio o dirección remitente que se puede verificar.
- Host y puerto SMTP.
- Usuario SMTP.
- Contraseña SMTP, introducida directamente en Supabase por el propietario; nunca guardada en Git ni enviada por chat.
- Nombre visible y dirección `From`, por ejemplo `Shoronpo <no-reply@auth.dominio.es>`.

## Pruebas de aprobación pendientes

1. Enviar invitación a una cuenta nueva y establecer contraseña.
2. Solicitar recuperación y comprobar que el enlace sólo funciona una vez.
3. Forzar segundo envío inmediato y verificar respuesta de límite comprensible.
4. Desactivar la cuenta y confirmar que una sesión previa pierde acceso a datos.
5. Reactivar y cambiar el rol; comprobar RLS y visibilidad del frontend.
6. Verificar MFA del administrador y rechazo con sesión `aal1`.
7. Revisar entrega, spam, SPF, DKIM y DMARC en el proveedor.

