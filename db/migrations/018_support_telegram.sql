-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Username Telegram customer service yang dipakai tombol "Hubungi via Telegram".

alter table public.app_settings
  add column if not exists support_telegram_username text;
