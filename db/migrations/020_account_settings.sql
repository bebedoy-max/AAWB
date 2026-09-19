-- 020_account_settings.sql
-- Kolom tambahan pada profiles untuk halaman Pengaturan Akun worker:
-- identitas kontak Telegram dan rekening/e-wallet tujuan pencairan saldo.
-- Tidak mengubah tabel lain; RLS profiles yang sudah ada tetap berlaku
-- (worker hanya bisa membaca/mengubah baris miliknya sendiri).

alter table public.profiles
  add column if not exists telegram_username text,
  add column if not exists disbursement_type text check (disbursement_type in ('bank', 'ewallet')),
  add column if not exists disbursement_destination text,
  add column if not exists disbursement_account_number text,
  add column if not exists disbursement_owner_name text;
