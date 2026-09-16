-- Estabilización: completa la automatización de los tres bloques de tSpoonLab.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'shoronpo-tspoon-productions-every-6-hours';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'shoronpo-tspoon-productions-every-6-hours',
  '32 */6 * * *',
  $job$
    select net.http_post(
      url := 'https://htuearldqvzqohoxwmdp.supabase.co/functions/v1/tspoonlab-sync-productions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-shoronpo-sync-key', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'shoronpo_sync_trigger_secret'
          order by created_at desc limit 1
        ),
        'x-idempotency-key', 'scheduled-productions-' || extract(epoch from now())::bigint::text || '-' || gen_random_uuid()::text
      ),
      body := jsonb_build_object('trigger', 'SCHEDULED'),
      timeout_milliseconds := 25000
    ) as request_id;
  $job$
);
