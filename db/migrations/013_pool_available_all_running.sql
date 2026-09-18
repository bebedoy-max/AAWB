-- 013: "Data yang tersisa saat ini" harus menghitung SEMUA kampanye berjalan,
-- bukan hanya kampanye kolam (is_pool). Sebelumnya angka bisa 0 walau ada
-- kampanye berjalan dengan sisa antrean.

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
  where q.claimed_by is null
    and q.status = 'pending'
    and c.status = 'running'
$$;

grant execute on function public.pool_available() to authenticated, service_role;
