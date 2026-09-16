create table if not exists public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('bank','ewallet')),
  provider text not null,
  number text not null,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, method, provider, number)
);

grant select, insert, update, delete on public.payout_accounts to authenticated;
grant all on public.payout_accounts to service_role;

alter table public.payout_accounts enable row level security;

drop policy if exists "own payout accounts" on public.payout_accounts;
create policy "own payout accounts" on public.payout_accounts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.payout_accounts (user_id, method, provider, number, name, is_default)
select p.user_id, p.payout_method, p.payout_provider, p.payout_number, p.payout_name, true
from public.profiles p
where p.payout_number is not null and p.payout_method in ('bank','ewallet')
  and coalesce(p.payout_provider,'') <> '' and coalesce(p.payout_name,'') <> ''
on conflict do nothing;
