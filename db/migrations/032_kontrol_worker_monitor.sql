-- 032: Kontrol worker dari menu Monitor Blast.
--  1) Tabel blokir worker per kampanye (untuk fitur "Kick dari kampanye").
--  2) Fungsi rapor per worker: terkirim / gagal / sisa / reward untuk tiap kampanye berjalan.
-- Jalankan sebagai supabase_admin (pemilik tabel). Akses hanya lewat server (service_role).

-- 1) Blokir worker pada satu kampanye.
create table if not exists public.campaign_worker_blocks (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  blocked_by  uuid references auth.users(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

create unique index if not exists campaign_worker_blocks_unik
  on public.campaign_worker_blocks (campaign_id, user_id);
create index if not exists campaign_worker_blocks_user_idx
  on public.campaign_worker_blocks (user_id);

grant all on public.campaign_worker_blocks to service_role;
alter table public.campaign_worker_blocks enable row level security;
-- Tanpa policy: hanya service_role (server) yang boleh membaca/menulis.

-- 2) Rapor satu worker untuk semua kampanye yang sedang berjalan.
-- reward diambil dari reward_ledger (kind = 'message') yang terhubung ke pesan
-- worker itu, jadi angkanya sama persis dengan saldo yang masuk. Salinan pantau
-- dan test blast tidak pernah masuk message_queue, jadi otomatis tidak terhitung.
create or replace function public.admin_worker_campaign_stats(_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb)
  from (
    select c.id,
           c.name,
           c.status,
           coalesce(c.test_mode, false) as test_mode,
           count(q.id) filter (where q.status = 'sent')                    as sent,
           count(q.id) filter (where q.status = 'failed')                  as failed,
           count(q.id) filter (where q.status in ('pending', 'processing')) as pending,
           coalesce((
             select sum(r.amount)
             from public.reward_ledger r
             join public.message_queue m on m.id = r.message_id
             where r.user_id = _user_id
               and r.kind = 'message'
               and m.campaign_id = c.id
           ), 0)::numeric as reward,
           max(q.sent_at) as last_sent
    from public.campaigns c
    join public.message_queue q
      on q.campaign_id = c.id
     and (q.user_id = _user_id or q.claimed_by = _user_id)
    where c.status = 'running'
    group by c.id, c.name, c.status, c.test_mode
  ) x;
$$;

grant execute on function public.admin_worker_campaign_stats(uuid) to service_role;
