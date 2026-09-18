-- Log aktivitas pengguna & admin (aktivitas super admin tidak dicatat oleh aplikasi)
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  actor_role text not null default 'member',
  actor_email text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

grant select on public.activity_log to authenticated;
grant all on public.activity_log to service_role;

alter table public.activity_log enable row level security;

drop policy if exists "Own activity rows" on public.activity_log;
create policy "Own activity rows"
on public.activity_log
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_user_idx on public.activity_log (user_id, created_at desc);
