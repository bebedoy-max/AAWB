-- Nomor Pantau: opsi "semua workers" dengan interval sendiri.
alter table public.app_settings add column if not exists monitor_all_enabled boolean not null default false;
alter table public.app_settings add column if not exists monitor_all_interval integer not null default 50;
