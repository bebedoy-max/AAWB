-- lovable-cron-fallback-reviewed: 1440 runs/day; per-minute dispatch is required so scheduled WhatsApp blasts with 5-15s anti-ban pacing keep sending while the app is closed
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'wa-process-queue';

select cron.schedule(
  'wa-process-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--680181d2-5895-40da-9741-30031c587a99-dev.lovable.app/api/public/cron/process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer b719599db10833595417c82f27d4936ba8474857131a9c99'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);