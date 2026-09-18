-- Jalankan sekali di Supabase Anda: SQL Editor > New query > paste > Run.
-- Menjaga alur: perangkat member hanya mengerjakan kampanye yang BERJALAN,
-- dan kampanye otomatis ditandai selesai bila seluruh nomornya sudah diproses.

-- 1. Klaim nomor hanya dari kampanye kolam yang statusnya 'running'
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
    select q.id
    from public.message_queue q
    join public.campaigns c on c.id = q.campaign_id
    where q.pool = true
      and q.claimed_by is null
      and q.status = 'pending'
      and c.is_pool = true
      and c.status = 'running'
    order by q.created_at
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

-- 2. Sisa nomor yang benar-benar bisa dikerjakan member sekarang
create or replace function public.pool_available()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.message_queue q
  join public.campaigns c on c.id = q.campaign_id
  where q.pool = true
    and q.claimed_by is null
    and q.status = 'pending'
    and c.is_pool = true
    and c.status = 'running'
$$;

grant execute on function public.pool_available() to authenticated, service_role;

-- 3. Tandai kampanye kolam sebagai selesai bila tidak ada sisa antrean
create or replace function public.complete_pool_campaigns()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  done int := 0;
begin
  update public.campaigns c
  set status = 'completed'
  where c.is_pool = true
    and c.status = 'running'
    and exists (select 1 from public.message_queue q where q.campaign_id = c.id)
    and not exists (
      select 1 from public.message_queue q
      where q.campaign_id = c.id and q.status in ('pending', 'processing')
    );
  get diagnostics done = row_count;
  return done;
end $$;

grant execute on function public.complete_pool_campaigns() to authenticated, service_role;

-- 4. Ringkasan admin: sisa kolam dihitung hanya dari kampanye yang berjalan
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
    'pool_unclaimed', (select public.pool_available()),
    'sent_last_minute', (select count(*) from public.message_queue
                         where status = 'sent' and sent_at > now() - interval '1 minute'),
    'earnings_total', (select coalesce(sum(amount), 0) from public.reward_ledger),
    'withdrawal_pending', (select coalesce(sum(amount), 0) from public.withdrawals where status = 'pending'),
    'withdrawal_paid', (select coalesce(sum(amount), 0) from public.withdrawals where status = 'approved')
  )
  where public.is_admin(auth.uid())
$$;

grant execute on function public.admin_overview() to authenticated, service_role;
