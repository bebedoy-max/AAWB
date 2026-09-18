-- 014: Satukan definisi antrean blast untuk SEMUA kampanye yang berjalan.
-- Masalah sebelumnya:
--  1. Kartu "Data yang tersisa" tetap 0 karena sisa antrean yang sudah
--     diklaim perangkat (claimed_by terisi) atau status 'processing' tidak
--     ikut dihitung, padahal itu bagian dari sisa pekerjaan.
--  2. Kampanye berjalan tidak dikerjakan perangkat karena klaim antrean
--     hanya mengambil kampanye bertipe kolam (is_pool / pool = true).
--
-- Jalankan sekali di Supabase Anda: SQL Editor > New query > paste > Run.

-- 1. Klaim nomor dari kampanye APA PUN yang sedang berjalan
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
    where q.claimed_by is null
      and q.status = 'pending'
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

-- 2. Sisa data = semua antrean yang belum terkirim/gagal dari kampanye berjalan
--    (termasuk yang sudah diklaim perangkat atau sedang diproses)
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
  where q.status in ('pending', 'processing')
    and c.status = 'running'
$$;

grant execute on function public.pool_available() to authenticated, service_role;

-- 3. Tandai kampanye sebagai selesai bila tidak ada sisa antrean (semua tipe)
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
  where c.status = 'running'
    and exists (select 1 from public.message_queue q where q.campaign_id = c.id)
    and not exists (
      select 1 from public.message_queue q
      where q.campaign_id = c.id and q.status in ('pending', 'processing')
    );
  get diagnostics done = row_count;
  return done;
end $$;

grant execute on function public.complete_pool_campaigns() to authenticated, service_role;
