-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Profil WhatsApp global: nama dan foto profil yang dipakai seluruh Worker's.

alter table public.app_settings
  add column if not exists wa_profile_name text,
  add column if not exists wa_profile_photo text;
