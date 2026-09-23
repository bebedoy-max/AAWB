-- 033: Bukti pesan benar-benar sampai.
--
-- Sebelum ini, "sent" hanya berarti gateway WhatsApp menerima perintah kirim.
-- Nomor yang tidak terdaftar WhatsApp pun dijawab OK oleh gateway sehingga ikut
-- tercatat sukses. Sekarang setiap baris menyimpan id pesan dari WhatsApp dan
-- tanda terimanya (sampai ke perangkat / dibaca), sehingga laporan bisa
-- membedakan "diterima gateway" dengan "benar-benar sampai".

alter table public.message_queue
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

comment on column public.message_queue.provider_message_id is
  'Id pesan dari WhatsApp, dipakai mencocokkan tanda terima (ack) dari gateway.';
comment on column public.message_queue.delivery_status is
  'server = baru diterima server WhatsApp, device = sampai ke HP penerima, read = dibaca.';

create index if not exists message_queue_provider_message_id_idx
  on public.message_queue (provider_message_id)
  where provider_message_id is not null;

create index if not exists message_queue_delivery_status_idx
  on public.message_queue (campaign_id, delivery_status);
