-- Aplicar únicamente después de configurar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='shoronpo-send-telegram-alerts';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'shoronpo-send-telegram-alerts',
  '2,17,32,47 * * * *',
  $job$
    select net.http_post(
      url := 'https://htuearldqvzqohoxwmdp.supabase.co/functions/v1/telegram-system-alerts',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-shoronpo-sync-key',(
          select decrypted_secret from vault.decrypted_secrets
          where name='shoronpo_sync_trigger_secret'
          order by created_at desc limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
