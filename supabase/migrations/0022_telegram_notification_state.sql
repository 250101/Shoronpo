-- Fase 12: estado de entrega de alertas por Telegram.
-- No contiene tokens, chat IDs ni contenido de conversaciones.

alter table public.system_alerts
  add column telegram_notified_at timestamptz,
  add column telegram_resolution_notified_at timestamptz;

create index system_alerts_telegram_pending
  on public.system_alerts(status, detected_at)
  where telegram_notified_at is null
     or (status='RESOLVED' and telegram_resolution_notified_at is null);

comment on column public.system_alerts.telegram_notified_at is
  'Momento en que Telegram confirmó la aceptación del aviso de apertura.';
comment on column public.system_alerts.telegram_resolution_notified_at is
  'Momento en que Telegram confirmó la aceptación del aviso de recuperación.';

