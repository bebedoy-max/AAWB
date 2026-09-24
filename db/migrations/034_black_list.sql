-- 034: Black List nomor pengirim.
-- Perangkat dengan nomor di tabel ini tidak akan mengirim pesan kampanye apa pun (diam-diam).
-- Akses hanya lewat server (service_role).
create table if not exists public.sender_blacklist (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  note       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant all on public.sender_blacklist to service_role;
alter table public.sender_blacklist enable row level security;
-- Tanpa policy: hanya service_role yang boleh membaca/menulis.
