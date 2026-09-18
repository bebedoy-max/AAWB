-- Kecepatan dan status siap-blast per perangkat (bukan lagi per akun).
alter table public.wa_sessions add column if not exists blast_speed text not null default 'santai';
alter table public.wa_sessions add column if not exists blast_ready boolean not null default false;
