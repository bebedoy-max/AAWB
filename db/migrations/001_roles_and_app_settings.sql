-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Menambah peran pengguna (super admin / admin / member) dan pengaturan gateway WhatsApp.

-- 1. Enum peran
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'admin', 'member');
  end if;
end $$;

-- 2. Tabel peran (peran TIDAK disimpan di tabel profiles)
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('super_admin', 'admin')
  )
$$;

drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "super admin manages roles" on public.user_roles;
create policy "super admin manages roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- 3. Pengaturan aplikasi (URL + API key gateway WhatsApp).
--    Hanya diakses dari server (service role), tidak pernah langsung dari browser.
create table if not exists public.app_settings (
  id text primary key default 'global',
  wa_gateway_url text,
  wa_gateway_api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_settings (id) values ('global') on conflict (id) do nothing;

grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
-- sengaja tanpa policy untuk anon/authenticated.

-- 4. Pengguna pertama menjadi super admin, pendaftar berikutnya menjadi member
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_any boolean;
begin
  select exists (select 1 from public.user_roles) into has_any;
  insert into public.user_roles (user_id, role)
  values (new.id, case when has_any then 'member'::public.app_role else 'super_admin'::public.app_role end)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
after insert on auth.users
for each row execute function public.handle_new_user_role();

revoke execute on function public.handle_new_user_role() from public, anon, authenticated;

-- 5. Backfill akun yang sudah ada: akun terlama jadi super admin, sisanya member
insert into public.user_roles (user_id, role)
select u.id,
       case when u.id = (select id from auth.users order by created_at asc limit 1)
            then 'super_admin'::public.app_role
            else 'member'::public.app_role end
from auth.users u
where not exists (select 1 from public.user_roles r where r.user_id = u.id)
on conflict (user_id, role) do nothing;
