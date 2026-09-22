-- 027: Monitor Blast (admin) + preset kecepatan + rem otomatis.
-- Hanya MENAMBAH kolom dan fungsi; aman dijalankan sebelum kode dipasang.
-- Jalankan sebagai supabase_admin (pemilik tabel).

-- 1) Kolom pengaturan tambahan (yang sudah ada tidak diubah).
alter table public.app_settings
  add column if not exists blast_daily_cap            int         not null default 1000,
  add column if not exists blast_speed_preset         text        not null default 'cepat',
  add column if not exists blast_auto_brake           boolean     not null default false,
  add column if not exists blast_auto_brake_threshold int         not null default 10,
  add column if not exists blast_auto_brake_last      timestamptz,
  add column if not exists blast_speed_updated_at     timestamptz,
  add column if not exists blast_speed_updated_by     text;

-- Indeks pendukung monitor (penolakan per perangkat).
create index if not exists message_queue_last_session_sent_idx
  on public.message_queue (last_session_id) where status = 'sent';

-- 2) Ringkasan monitor dalam SATU panggilan (dipanggil server dengan service role).
create or replace function public.admin_blast_monitor()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg        jsonb;
  warm       int;
  v_totals   jsonb;
  v_devices  jsonb;
  v_errors   jsonb;
  v_minutes  jsonb;
  v_blasters jsonb;
  v_campaign jsonb;
  v_rep      jsonb;
begin
  select to_jsonb(a) into cfg from public.app_settings a where id = 'global';
  warm := coalesce((cfg ->> 'blast_warmup_count')::int, 30);

  -- Total pengiriman & antrean
  select jsonb_build_object(
    'sent_10m',   count(*) filter (where sent_at > now() - interval '10 minutes'),
    'sent_60m',   count(*),
    'senders_10m', count(distinct sender_phone) filter (where sent_at > now() - interval '10 minutes'),
    'senders_60m', count(distinct sender_phone)
  ) into v_totals
  from public.message_queue
  where status = 'sent' and sent_at > now() - interval '60 minutes';

  v_totals := v_totals || jsonb_build_object(
    'pending',       (select count(*) from public.message_queue q join public.campaigns c on c.id = q.campaign_id
                       where q.status = 'pending' and c.status = 'running'),
    'pending_ready', (select count(*) from public.message_queue q join public.campaigns c on c.id = q.campaign_id
                       where q.status = 'pending' and c.status = 'running' and q.scheduled_at <= now()),
    'processing',    (select count(*) from public.message_queue where status = 'processing'),
    'retrying',      (select count(*) from public.message_queue where status = 'pending' and attempts > 0)
  );

  -- Perangkat
  select jsonb_build_object(
    'ready_db',   count(*) filter (where status = 'connected' and blast_ready),
    'active_5m',  count(*) filter (where status = 'connected' and blast_ready
                                     and last_ping > now() - interval '5 minutes'),
    'cooling',    count(*) filter (where cooldown_until > now()),
    'ready_unique_phones', count(distinct phone_number) filter (where status = 'connected' and blast_ready),
    'connected_db', count(*) filter (where status = 'connected')
  ) into v_devices
  from public.wa_sessions;

  -- Galat 30 menit terakhir (perkiraan: pesan yang dijadwalkan ulang/ditandai dalam jendela ini)
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into v_errors
  from (
    select case
             when error_log ilike 'Koneksi perangkat terputus saat mengirim%' then 'terputus'
             when error_log ilike 'Perangkat WhatsApp belum siap%'            then 'belum_siap'
             when error_log ilike '%kode 463%'                                then 'ditolak_463'
             when error_log ilike '%dibatasi WhatsApp%'                       then 'ditahan'
             when error_log ilike 'Tidak pasti%'                              then 'tidak_pasti'
             when error_log ilike '%gateway%'                                 then 'gateway'
             else 'lainnya'
           end as kind,
           count(*) as n
    from public.message_queue
    where error_log is not null and scheduled_at > now() - interval '30 minutes'
    group by 1
  ) e;

  -- Penolakan 463 pada nomor mapan (30 menit)
  v_errors := v_errors || jsonb_build_object('ditolak_mapan', (
    select count(*) from public.message_queue q
    where q.error_log ilike '%kode 463%'
      and q.scheduled_at > now() - interval '30 minutes'
      and (select count(*) from public.message_queue m
            where m.last_session_id = q.last_session_id and m.status = 'sent') >= warm
  ));

  -- Per menit (60 menit terakhir)
  select coalesce(jsonb_agg(jsonb_build_object('m', mm, 'sent', c, 'senders', d) order by mm), '[]'::jsonb)
    into v_minutes
  from (
    select date_trunc('minute', sent_at) as mm, count(*) as c, count(distinct sender_phone) as d
    from public.message_queue
    where status = 'sent' and sent_at > now() - interval '60 minutes'
    group by 1
  ) t;

  -- Per blaster (60 menit terakhir)
  with s60 as (
    select sender_phone, last_session_id, sent_at
    from public.message_queue
    where status = 'sent' and sent_at > now() - interval '60 minutes' and sender_phone is not null
  ),
  gaps as (
    select sender_phone, sent_at - lag(sent_at) over (partition by sender_phone order by sent_at) as g
    from s60
  ),
  per as (
    select sender_phone,
           count(*) as n60,
           count(*) filter (where sent_at > now() - interval '10 minutes') as n10,
           max(sent_at) as last_sent,
           (array_agg(last_session_id order by sent_at desc))[1] as sess
    from s60 group by 1
  ),
  med as (
    select sender_phone,
           percentile_cont(0.5) within group (order by extract(epoch from g))
             filter (where g < interval '2 minutes') as md
    from gaps group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(b) order by b.sent_60m desc), '[]'::jsonb) into v_blasters
  from (
    select p.sender_phone as phone,
           p.n60 as sent_60m,
           p.n10 as sent_10m,
           round(m.md::numeric, 1) as median_sec,
           p.last_sent,
           ws.blast_speed as mode,
           ws.blast_ready,
           ws.status::text as device_status,
           ws.cooldown_until,
           ws.last_ping,
           coalesce(pr.organization_name, '') as worker,
           (select count(*) from public.message_queue x
             where x.sender_phone = p.sender_phone and x.status = 'sent') as total_sent
    from per p
    left join med m using (sender_phone)
    left join public.wa_sessions ws on ws.id = p.sess
    left join public.profiles pr on pr.user_id = ws.user_id
    order by p.n60 desc
    limit 200
  ) b;

  -- Rapor per golongan (15 menit, hanya nomor dengan >= 3 pesan)
  with k as (
    select sender_phone, count(*) as n,
           extract(epoch from max(sent_at) - min(sent_at)) / 60.0 as menit
    from public.message_queue
    where status = 'sent' and sent_at > now() - interval '15 minutes'
    group by 1 having count(*) >= 3
  ),
  g as (
    select k.*, (k.n - 1) / nullif(k.menit, 0) as per_menit,
           (select count(*) from public.message_queue m
             where m.sender_phone = k.sender_phone and m.status = 'sent') >= warm as mapan
    from k
  )
  select jsonb_build_object(
    'mapan_aktif',           count(*) filter (where mapan),
    'pemanasan_aktif',       count(*) filter (where not mapan),
    'rata_mapan_per_menit',  round(avg(per_menit) filter (where mapan)::numeric, 1),
    'rata_pemanasan_per_menit', round(avg(per_menit) filter (where not mapan)::numeric, 1)
  ) into v_rep
  from g;

  -- Kampanye berjalan
  select coalesce(jsonb_agg(to_jsonb(c2) order by c2.name), '[]'::jsonb) into v_campaign
  from (
    select c.id, c.name,
           count(*) filter (where q.status = 'pending') as pending,
           count(*) filter (where q.status = 'sent') as sent,
           count(*) filter (where q.status = 'failed') as failed
    from public.campaigns c
    left join public.message_queue q on q.campaign_id = c.id
    where c.status = 'running'
    group by c.id, c.name
  ) c2;

  return jsonb_build_object(
    'now', now(),
    'settings', jsonb_build_object(
      'preset',          coalesce(cfg ->> 'blast_speed_preset', 'cepat'),
      'min_delay_sec',   (cfg ->> 'blast_min_delay_sec')::numeric,
      'max_delay_sec',   (cfg ->> 'blast_max_delay_sec')::numeric,
      'hourly_cap',      (cfg ->> 'blast_hourly_cap')::int,
      'daily_cap',       (cfg ->> 'blast_daily_cap')::int,
      'warmup_count',    warm,
      'auto_brake',      coalesce((cfg ->> 'blast_auto_brake')::boolean, false),
      'auto_brake_last', cfg -> 'blast_auto_brake_last'
    ),
    'totals',    v_totals,
    'devices',   v_devices,
    'errors',    v_errors,
    'report',    v_rep,
    'minutes',   v_minutes,
    'blasters',  v_blasters,
    'campaigns', v_campaign
  );
end $$;

revoke all on function public.admin_blast_monitor() from public, anon, authenticated;
grant execute on function public.admin_blast_monitor() to service_role;

-- 3) Uji cepat (harus mengembalikan satu baris JSON, bukan galat).
select jsonb_pretty(public.admin_blast_monitor() -> 'totals');
