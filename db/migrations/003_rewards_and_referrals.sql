-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Sistem reward per pesan terkirim + referal berjenjang + penarikan saldo.

-- 1. Pengaturan reward (dinamis, diatur super admin) menempel di app_settings
alter table public.app_settings add column if not exists reward_per_message numeric not null default 100;
alter table public.app_settings add column if not exists min_withdrawal numeric not null default 50000;
alter table public.app_settings add column if not exists referral_levels int not null default 1;
alter table public.app_settings add column if not exists referral_rate_l1 numeric not null default 100;
alter table public.app_settings add column if not exists referral_rate_l2 numeric not null default 0;
alter table public.app_settings add column if not exists referral_rate_l3 numeric not null default 0;
alter table public.app_settings add column if not exists rewards_enabled boolean not null default true;

-- 2. Kode referal & data rekening di profiles
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists payout_method text;
alter table public.profiles add column if not exists payout_provider text;
alter table public.profiles add column if not exists payout_number text;
alter table public.profiles add column if not exists payout_name text;

create or replace function public.gen_referral_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end $$;

update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

create or replace function public.set_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.gen_referral_code();
  end if;
  return new;
end $$;

drop trigger if exists profiles_referral_code on public.profiles;
create trigger profiles_referral_code before insert on public.profiles
  for each row execute function public.set_referral_code();

-- 3. Buku besar reward
create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message', 'referral', 'adjustment')),
  amount numeric not null,
  message_id uuid references public.message_queue(id) on delete set null,
  source_user_id uuid references auth.users(id) on delete set null,
  level int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists reward_ledger_unique_msg
  on public.reward_ledger (kind, message_id, user_id, level)
  where message_id is not null;
create index if not exists reward_ledger_user_idx on public.reward_ledger (user_id, created_at desc);

grant select on public.reward_ledger to authenticated;
grant all on public.reward_ledger to service_role;
alter table public.reward_ledger enable row level security;

drop policy if exists "read own rewards" on public.reward_ledger;
create policy "read own rewards" on public.reward_ledger
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- 4. Penarikan saldo
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text,
  provider text,
  account_number text,
  account_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid
);

create index if not exists withdrawals_user_idx on public.withdrawals (user_id, created_at desc);

grant select, insert on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;
alter table public.withdrawals enable row level security;

drop policy if exists "read own withdrawals" on public.withdrawals;
create policy "read own withdrawals" on public.withdrawals
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- 5. Saldo = total reward - penarikan tertunda/disetujui
create or replace function public.reward_balance(_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(amount) from public.reward_ledger where user_id = _user_id), 0)
       - coalesce((select sum(amount) from public.withdrawals
                   where user_id = _user_id and status in ('pending', 'approved')), 0)
$$;

grant execute on function public.reward_balance(uuid) to authenticated, service_role;

-- 6. Kredit reward saat sebuah pesan berhasil terkirim (dipanggil worker)
create or replace function public.credit_message_reward(_message_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  owner uuid;
  total numeric := 0;
  upline uuid;
  lvl int := 1;
  rate numeric;
begin
  select * into s from public.app_settings where id = 'global';
  if s is null or s.rewards_enabled is not true then
    return 0;
  end if;

  select user_id into owner from public.message_queue where id = _message_id and status = 'sent';
  if owner is null then
    return 0;
  end if;

  if s.reward_per_message > 0 then
    insert into public.reward_ledger (user_id, kind, amount, message_id, level)
    values (owner, 'message', s.reward_per_message, _message_id, 0)
    on conflict do nothing;
    total := total + s.reward_per_message;
  end if;

  upline := (select referred_by from public.profiles where user_id = owner);
  while upline is not null and lvl <= least(s.referral_levels, 3) loop
    rate := case lvl
      when 1 then s.referral_rate_l1
      when 2 then s.referral_rate_l2
      else s.referral_rate_l3
    end;
    if rate > 0 then
      insert into public.reward_ledger (user_id, kind, amount, message_id, source_user_id, level)
      values (upline, 'referral', rate, _message_id, owner, lvl)
      on conflict do nothing;
      total := total + rate;
    end if;
    upline := (select referred_by from public.profiles where user_id = upline);
    lvl := lvl + 1;
  end loop;

  return total;
end $$;

-- Aman untuk authenticated: fungsi hanya mengkredit pemilik pesan berstatus 'sent',
-- dan indeks unik mencegah kredit ganda.
grant execute on function public.credit_message_reward(uuid) to authenticated, service_role;
