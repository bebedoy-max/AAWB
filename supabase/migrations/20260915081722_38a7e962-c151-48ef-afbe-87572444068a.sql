-- lovable-cron-fallback-reviewed: 1440 runs/day; per-minute dispatch is required so scheduled WhatsApp blasts with 5-15s anti-ban pacing keep sending while the app is closed
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'wa-process-queue';

select cron.schedule(
  'wa-process-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--6b5d00c7-3c4d-48ca-9f79-ff43fe0f1a46-dev.lovable.app/api/public/cron/process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer dc77d586d54cdfb89455d49a6daa8a1d39cb5b6726079a5f'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);