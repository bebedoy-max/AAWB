-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Menambah kolom pengaturan bot Telegram pada tabel app_settings.

alter table public.app_settings
  add column if not exists telegram_bot_token text,
  add column if not exists telegram_bot_username text;
