-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Tabel penghubung akun Telegram milik masing-masing pengguna.

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint,
  username text,
  first_name text,
  link_code text unique,
  code_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_links_chat_id on public.telegram_links (chat_id);
create index if not exists idx_telegram_links_link_code on public.telegram_links (link_code);

-- Akses Data API: tabel ini hanya dibaca/ditulis lewat service role (server),
-- jadi tidak ada hak untuk anon maupun authenticated.
grant all on public.telegram_links to service_role;

alter table public.telegram_links enable row level security;

-- Pengguna boleh melihat barisnya sendiri (kalau nanti dibaca dari klien).
drop policy if exists "Users can view own telegram link" on public.telegram_links;
create policy "Users can view own telegram link"
on public.telegram_links
for select
to authenticated
using (auth.uid() = user_id);
