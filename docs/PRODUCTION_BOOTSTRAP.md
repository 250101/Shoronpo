# Bootstrap de producción

Proyecto: `shoronpo-prod`  
Referencia: `krpiprwplhxrxlhzcuak`  
Región: `eu-west-2` (Londres)

## Estado inicial

- Migraciones de esquema `0001`–`0027` aplicadas.
- `0008` se registra como marcador; el administrador se crea manualmente.
- `0014`, `0017`, `0020`, `0023` y `0025` se registran sin ejecutar porque activan cron con URLs del entorno de desarrollo.
- `0021` crea el sistema de alertas sin activar cron ni generar incidentes iniciales.
- No se cargan inventarios, usuarios operativos, secretos ni datos de tSpoonLab durante esta fase.

## Primer administrador

1. Crear el usuario en Supabase Auth desde el panel productivo.
2. Copiar su UUID sin guardarlo en el repositorio.
3. En SQL Editor, como `postgres`, insertar su perfil y rol `ADMINISTRADOR` dentro de una transacción.
4. Verificar perfil activo, rol y ausencia de otros cambios.
5. Enrolar MFA desde el frontend productivo antes de permitir administración.
6. Crear un segundo administrador de respaldo mediante el flujo normal y MFA.

## Activaciones pospuestas

Los cron, funciones tSpoonLab, Telegram y secretos se activan en las fases de operación y puesta en producción. Nunca se deben copiar secretos de staging a producción de forma automática.

