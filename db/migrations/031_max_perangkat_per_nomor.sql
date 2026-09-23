-- 031: Batas tersembunyi jumlah perangkat per satu nomor pengirim yang boleh dipakai blast.
-- Worker tetap boleh menautkan sampai 4 perangkat pada satu nomor; admin yang menentukan
-- berapa perangkat dari nomor itu yang benar-benar dipakai mengirim.

alter table public.app_settings
  add column if not exists blast_max_devices_per_number smallint not null default 4;

update public.app_settings
set blast_max_devices_per_number = least(greatest(coalesce(blast_max_devices_per_number, 4), 1), 4)
where id = 'global';
