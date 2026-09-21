# Fase 4 — Operación, observabilidad y alertas

## Objetivo

Detectar y clasificar fallos de tSpoonLab, proteger la integridad de los datos, evitar avisos Telegram concurrentes y disponer de un procedimiento verificable para renovar una sesión expirada.

## Controles implementados

- Stock, Producciones y Pedidos actualizan el estado central del conector tanto al recuperarse como ante `AUTH_EXPIRED`, `FORBIDDEN`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `NETWORK_ERROR` o `INVALID_RESPONSE`.
- Una credencial ausente se trata como `AUTH_EXPIRED`; nunca se registra ni devuelve el token.
- Los incidentes tienen alcance `LIVE` o `DRILL`. El panel y Telegram sólo procesan `LIVE`.
- `AUTH_EXPIRED` conserva su clasificación y no genera además un `SYNC_FAILED` genérico para el mismo fallo.
- Telegram reclama temporalmente cada entrega antes de enviarla. Otra ejecución concurrente no puede reclamarla; un fallo libera el reclamo y un reclamo abandonado vence a los diez minutos.
- Cada mensaje indica explícitamente el entorno (`STAGING` o `PRODUCTION`).

## Pruebas controladas

Las pruebas automáticas simulan sin llamar a tSpoonLab ni Telegram:

- credencial ausente;
- respuestas 401 y 403;
- respuesta 429 con reintentos limitados;
- respuesta 503 con reintentos limitados;
- interrupción de red;
- respuesta 200 con JSON inválido;
- ocultación del token en serialización;
- separación `LIVE`/`DRILL`;
- reclamo y liberación de una entrega Telegram.

Los endpoints desplegados también se prueban con una clave deliberadamente inválida; todos deben responder `401` sin crear una corrida ni una alerta.

## Renovación de sesión

1. Confirmar `AUTH_EXPIRED` en Sistema y en Telegram.
2. Iniciar sesión manualmente en tSpoonLab.
3. Obtener `rememberme` con el extractor local; no pegarlo en chats, tickets ni Git.
4. Reemplazar `TSPOONLAB_REMEMBERME` en el proyecto Supabase afectado.
5. Ejecutar `tspoonlab-health` con la clave operativa y comprobar `HEALTHY`.
6. Ejecutar una sola sincronización manual con una clave de idempotencia nueva.
7. Comprobar `SUCCEEDED`, cierre del incidente y un único aviso de recuperación.

## Criterio de cierre

- Todas las simulaciones pasan.
- La migración y las funciones se validan primero en staging.
- Staging no envía alertas al grupo productivo durante los ensayos.
- Producción se despliega sólo después de verificar staging y nunca se fuerza una expiración real de su sesión.

## Resultado de validación

- Staging mostró las tres sincronizaciones operativas, el conector `HEALTHY` y ningún incidente activo ni error de navegador.
- La migración `0028` quedó aplicada en staging y producción.
- Las cinco Edge Functions quedaron desplegadas en ambos entornos.
- Los cinco endpoints rechazaron una clave deliberadamente inválida con HTTP `401` tanto en staging como en producción, sin crear corridas ni alertas.
- Producción conserva cron, credenciales de tSpoonLab y Telegram desactivados hasta la activación operativa explícita.
- La prueba SQL transaccional queda pendiente de ejecución local porque Docker Desktop no estaba disponible; la migración remota sí fue aplicada y validada mediante el panel.
