-- Penanda perangkat yang dijeda admin, agar auto-start "Start mati" tidak menyalakannya lagi.
alter table public.wa_sessions add column if not exists admin_paused boolean not null default false;
notify pgrst, 'reload schema';
