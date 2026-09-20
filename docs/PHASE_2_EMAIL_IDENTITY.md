# Fase 2 — Correo transaccional y ciclo de usuarios

## Objetivo

Invitaciones, recuperación y cambio de contraseña confiables, sin depender del SMTP de prueba de Supabase, con administración protegida por MFA y mensajes que no revelen si una cuenta existe.

## Estado auditado

- `site_url` y las redirecciones autorizadas apuntan al deploy de staging.
- La confirmación de email está activa.
- TOTP está habilitado para enrolamiento y verificación.
- SMTP personalizado activo en `shoronpo-dev` mediante la cuenta técnica `shoronpoinventario@gmail.com`, contraseña de aplicación y `smtp.gmail.com:587`.
- La recuperación real devolvió HTTP 200 y el correo fue recibido por la cuenta administradora.
- Invitación real, establecimiento de contraseña e inicio de sesión con rol `DIRECCION` ya fueron validados.
- La recuperación ahora diferencia límite de frecuencia, indisponibilidad y errores de entrada sin enumerar cuentas.

## Proveedor adoptado

Se adoptó Gmail con una cuenta técnica exclusiva porque Shoronpo todavía no dispone de dominio propio. Es suficiente para el volumen inicial, pero Supabase advierte que un proveedor personal puede tener menor entregabilidad que uno transaccional. Al adquirir un dominio, se migrará a un relay con SPF, DKIM y DMARC sin cambiar el flujo de la aplicación.

## Configuración aplicada

- Remitente y usuario: `shoronpoinventario@gmail.com`.
- Nombre visible: `Shoronpo`.
- Host y puerto: `smtp.gmail.com:587`.
- Intervalo mínimo por usuario: 60 segundos.
- La contraseña de aplicación fue introducida directamente en Supabase y no se almacena en Git.

## Evidencia de aprobación

1. Invitación real, establecimiento de contraseña e inicio con rol `DIRECCION`: aprobado previamente.
2. Recuperación real por SMTP personalizado: HTTP 200 y recepción confirmada el 20-09-2026.
3. Credencial inválida forzada: Google devolvió 534 y Supabase registró el fallo sin marcarlo como éxito; corregida con una nueva contraseña de aplicación.
4. Mensaje de recuperación genérico: aprobado, sin enumeración de cuentas.
5. Manejo de límite, indisponibilidad y errores de red: cubierto por pruebas automatizadas.
6. MFA del administrador y rechazo de operaciones privilegiadas con `aal1`: aprobado.

## Controles posteriores

- Probar caducidad y uso único del enlace en una ventana operativa que no obligue a cambiar la contraseña administradora actual.
- Migrar a dominio propio con SPF, DKIM y DMARC cuando Shoronpo disponga de uno.
