-- Jalankan sekali di Supabase Anda: SQL Editor > New query > paste > Run.
-- Memisahkan alur MEMBER (hubungkan perangkat + blast) dan ADMIN (proyek + monitoring).

-- 1. Batas perangkat per member + nomor WhatsApp tidak boleh duplikat
alter table public.app_settings add column if not exists max_devices_per_member int not null default 4;

create unique index if not exists wa_sessions_phone_unique
  on public.wa_sessions (phone_number)
  where phone_number is not null;

create or replace function public.enforce_device_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  used int;
begin
  select coalesce(max_devices_per_member, 4) into lim from public.app_settings where id = 'global';
  lim := coalesce(lim, 4);
  select count(*) into used from public.wa_sessions where user_id = new.user_id;
  if used >= lim then
    raise exception 'Batas perangkat tercapai (maksimal % perangkat)', lim;
  end if;
  return new;
end $$;

drop trigger if exists wa_sessions_device_limit on public.wa_sessions;
create trigger wa_sessions_device_limit
before insert on public.wa_sessions
for each row execute function public.enforce_device_limit();

-- 2. Proyek blast milik admin = kolam pesan yang dikerjakan perangkat member
alter table public.campaigns add column if not exists is_pool boolean not null default false;
alter table public.campaigns add column if not exists message_body text;

alter table public.message_queue add column if not exists pool boolean not null default false;
alter table public.message_queue add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table public.message_queue add column if not exists claimed_at timestamptz;
alter table public.message_queue add column if not exists session_id uuid references public.wa_sessions(id) on delete set null;

create index if not exists message_queue_pool_idx
  on public.message_queue (pool, claimed_by, status);
create index if not exists message_queue_session_idx
  on public.message_queue (session_id, status);

-- 3. Preferensi blast member
alter table public.profiles add column if not exists blast_speed text not null default 'santai';
alter table public.profiles add column if not exists blast_running boolean not null default false;

-- 4. Admin boleh memonitor seluruh data (member tetap hanya melihat miliknya)
drop policy if exists "admin reads all queue" on public.message_queue;
create policy "admin reads all queue" on public.message_queue
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "admin reads all sessions" on public.wa_sessions;
create policy "admin reads all sessions" on public.wa_sessions
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "admin reads all campaigns" on public.campaigns;
create policy "admin reads all campaigns" on public.campaigns
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "admin reads all profiles" on public.profiles;
create policy "admin reads all profiles" on public.profiles
  for select to authenticated using (public.is_admin(auth.uid()));

-- Member boleh memperbarui preferensi blast di profilnya sendiri
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Ambil (klaim) sebagian nomor dari kolam untuk dikerjakan perangkat member.
--    Pesan yang diklaim menjadi milik member, sehingga reward masuk ke member.
create or replace function public.claim_blast_batch(_session_id uuid, _limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed int := 0;
  owner uuid;
begin
  select user_id into owner from public.wa_sessions where id = _session_id;
  if owner is null or owner <> auth.uid() then
    raise exception 'Perangkat tidak dikenali';
  end if;

  with kandidat as (
    select id from public.message_queue
    where pool = true and claimed_by is null and status = 'pending'
    order by created_at
    limit greatest(1, least(coalesce(_limit, 20), 200))
    for update skip locked
  )
  update public.message_queue q
  set claimed_by = auth.uid(),
      user_id = auth.uid(),
      session_id = _session_id,
      claimed_at = now(),
      scheduled_at = now()
  from kandidat k
  where q.id = k.id;

  get diagnostics claimed = row_count;
  return claimed;
end $$;

grant execute on function public.claim_blast_batch(uuid, int) to authenticated, service_role;

-- 6. Ringkasan monitoring untuk admin (satu kali panggil, cepat)
create or replace function public.admin_overview()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'members', (select count(*) from public.user_roles where role = 'member'),
    'devices_total', (select count(*) from public.wa_sessions),
    'devices_connected', (select count(*) from public.wa_sessions where status = 'connected'),
    'devices_working', (select count(distinct session_id) from public.message_queue
                        where session_id is not null and sent_at > now() - interval '2 minutes'),
    'sent_total', (select count(*) from public.message_queue where status = 'sent'),
    'failed_total', (select count(*) from public.message_queue where status = 'failed'),
    'pending_total', (select count(*) from public.message_queue where status in ('pending','processing')),
    'pool_unclaimed', (select count(*) from public.message_queue
                       where pool = true and claimed_by is null and status = 'pending'),
    'sent_last_minute', (select count(*) from public.message_queue
                         where status = 'sent' and sent_at > now() - interval '1 minute'),
    'earnings_total', (select coalesce(sum(amount), 0) from public.reward_ledger),
    'withdrawal_pending', (select coalesce(sum(amount), 0) from public.withdrawals where status = 'pending'),
    'withdrawal_paid', (select coalesce(sum(amount), 0) from public.withdrawals where status = 'approved')
  )
  where public.is_admin(auth.uid())
$$;

grant execute on function public.admin_overview() to authenticated, service_role;
