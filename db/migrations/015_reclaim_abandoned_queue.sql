-- 015: Izinkan perangkat aktif mengambil alih antrean yang ditinggalkan.
-- Jalankan setelah migrasi 014.

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
    where c.status = 'running'
      and q.status in ('pending', 'processing')
      and (
        q.claimed_by is null
        or q.session_id is null
        or not exists (
          select 1
          from public.wa_sessions s
          where s.id = q.session_id
            and s.blast_ready = true
            and s.status = 'connected'
            and s.last_ping >= now() - interval '90 seconds'
        )
      )
    order by q.created_at
    limit greatest(1, least(coalesce(_limit, 20), 200))
    for update of q skip locked
  )
  update public.message_queue q
  set claimed_by = auth.uid(),
      user_id = auth.uid(),
      session_id = _session_id,
      claimed_at = now(),
      scheduled_at = now(),
      status = 'pending'
  from kandidat k
  where q.id = k.id;

  get diagnostics claimed = row_count;
  return claimed;
end $$;

grant execute on function public.claim_blast_batch(uuid, int) to authenticated, service_role;