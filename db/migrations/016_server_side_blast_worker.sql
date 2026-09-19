-- Pekerja blast sisi server: pengiriman tetap berjalan tanpa browser worker.
--
-- Bagian ini TIDAK butuh pg_cron. Cukup pg_net (sudah aktif).
-- Penjadwalannya dipilih salah satu:
--   A) 016b_cron_schedule.sql  -> kalau pg_cron bisa diaktifkan
--   B) layanan cron eksternal  -> panggil endpoint aplikasi tiap menit
--
-- SEBELUM RUN: ganti satu nilai di bawah ini.
--   cron_secret  -> nilai yang sama dengan secret WA_CRON_SECRET di aplikasi.

create table if not exists public.cron_settings (
  key text primary key,
  value text not null
);
alter table public.cron_settings enable row level security;
grant all on public.cron_settings to service_role;

insert into public.cron_settings (key, value) values
  ('app_url', 'https://project--9ada5527-4511-4ad0-96c9-7012cfcd6053-dev.lovable.app'),
  ('cron_secret', 'GANTI-DENGAN-WA_CRON_SECRET')
on conflict (key) do update set value = excluded.value;

create or replace function public.kick_blast_workers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.cron_settings where key = 'app_url';
  select value into v_secret from public.cron_settings where key = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/public/cron/blast-devices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );

  perform net.http_post(
    url := v_url || '/api/public/cron/process-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

