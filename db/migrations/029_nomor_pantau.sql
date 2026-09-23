-- 029: Nomor Pantau.
-- Super admin menetapkan nomor pantau (nomor HP milik pengawas). Saat kampanye
-- berjalan, pengirim tertentu (berdasarkan nomor pengirim, worker, atau kode
-- negara penerima) ikut mengirim salinan pesan ke nomor pantau setiap N pesan.
-- Salinan pantau TIDAK masuk message_queue, jadi otomatis:
--   - tidak menghasilkan reward apa pun,
--   - tidak pernah muncul di laporan riwayat pengiriman.
-- Jalankan sebagai supabase_admin (pemilik tabel).

-- 1) Pengaturan global nomor pantau.
alter table public.app_settings
  add column if not exists monitor_enabled       boolean not null default false,
  add column if not exists monitor_interval      int     not null default 20,
  add column if not exists monitor_country_codes text    not null default '',
  add column if not exists monitor_include_note  boolean not null default true;

-- 2) Daftar nomor pantau.
create table if not exists public.monitor_numbers (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,
  label       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

grant all on public.monitor_numbers to service_role;
alter table public.monitor_numbers enable row level security;

-- 3) Sasaran: nomor pengirim atau worker yang wajib mengambil nomor pantau.
create table if not exists public.monitor_targets (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('sender_phone', 'worker')),
  value       text,
  user_id     uuid references auth.users(id) on delete cascade,
  label       text,
  created_at  timestamptz not null default now()
);

create unique index if not exists monitor_targets_phone_idx
  on public.monitor_targets (value) where kind = 'sender_phone';
create unique index if not exists monitor_targets_worker_idx
  on public.monitor_targets (user_id) where kind = 'worker';

grant all on public.monitor_targets to service_role;
alter table public.monitor_targets enable row level security;

-- 4) Penghitung per pengirim (untuk aturan "setiap N pesan").
create table if not exists public.monitor_counters (
  counter_key text primary key,
  counter     int not null default 0,
  updated_at  timestamptz not null default now()
);

grant all on public.monitor_counters to service_role;
alter table public.monitor_counters enable row level security;

-- 5) Riwayat salinan pantau (terpisah dari laporan pengiriman).
create table if not exists public.monitor_log (
  id             uuid primary key default gen_random_uuid(),
  monitor_phone  text not null,
  sender_phone   text,
  session_id     text,
  owner_id       uuid,
  worker_name    text,
  recipient_phone text,
  campaign_id    uuid,
  reason         text,
  status         text not null default 'sent',
  error_log      text,
  created_at     timestamptz not null default now()
);

create index if not exists monitor_log_created_idx on public.monitor_log (created_at desc);

grant all on public.monitor_log to service_role;
alter table public.monitor_log enable row level security;

-- 6) Penghitung atomik: naikkan 1, kembalikan true bila kelipatan interval.
create or replace function public.monitor_tick(_key text, _interval int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  step int := greatest(1, coalesce(_interval, 1));
begin
  insert into public.monitor_counters (counter_key, counter, updated_at)
  values (_key, 1, now())
  on conflict (counter_key)
  do update set counter = public.monitor_counters.counter + 1, updated_at = now()
  returning counter into n;

  return (n % step) = 0;
end $$;

grant execute on function public.monitor_tick(text, int) to service_role;
