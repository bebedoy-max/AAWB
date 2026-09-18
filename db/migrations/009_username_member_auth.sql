-- Username unik untuk alur pendaftaran member tanpa email yang terlihat.
alter table public.profiles add column if not exists username text;

update public.profiles p
set username = lower(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9_]+', '_', 'g'))
from auth.users u
where p.user_id = u.id and p.username is null;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or (char_length(username) between 4 and 24 and username ~ '^[a-z0-9_]+$'));

-- profiles sudah merupakan tabel pengguna; izin tetap mengikuti policy yang tersedia.
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;