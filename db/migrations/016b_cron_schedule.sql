-- OPSIONAL: hanya jalankan kalau extension pg_cron berhasil diaktifkan.
-- Jalankan setelah 016_server_side_blast_worker.sql.

-- Jalankan setiap menit, dan sekali lagi di detik ke-30 supaya nyaris tanpa jeda.
select cron.unschedule(jobid) from cron.job where jobname in ('aawb_blast_worker', 'aawb_blast_worker_half');

select cron.schedule('aawb_blast_worker', '* * * * *', $$select public.kick_blast_workers();$$);
select cron.schedule(
  'aawb_blast_worker_half',
  '* * * * *',
  $$select pg_sleep(30); select public.kick_blast_workers();$$
);
