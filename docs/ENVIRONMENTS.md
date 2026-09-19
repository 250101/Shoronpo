# Entornos de Shoronpo

## Staging

- Frontend: deploy de rama `codex/fase2-supabase-auth` en Netlify.
- Supabase: proyecto de desarrollo `htuearldqvzqohoxwmdp` (`shoronpo-dev`).
- Si no hay variables de Netlify, los contextos que no son producción usan este proyecto.

## Producción

Producción debe utilizar otro proyecto de Supabase. En el contexto `production` de Netlify son obligatorias:

- `SHORONPO_SUPABASE_URL`
- `SHORONPO_SUPABASE_PUBLISHABLE_KEY`

El build falla si faltan, si la URL no pertenece a Supabase o si apunta al proyecto de desarrollo. La clave publicable puede estar en el navegador; `service_role`, contraseñas y secretos de integraciones nunca deben incluirse en estas variables públicas.

## Promoción segura

1. Aplicar y probar las migraciones primero en staging.
2. Ejecutar las pruebas automatizadas.
3. Crear un backup recuperable de producción.
4. Aplicar las migraciones pendientes en producción.
5. Desplegar el frontend y ejecutar pruebas de lectura, escritura autorizada y rechazo de permisos.
6. Mantener cron, secretos de tSpoonLab, Telegram y usuarios separados por proyecto.

