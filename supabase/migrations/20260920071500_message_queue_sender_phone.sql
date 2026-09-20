-- Menyimpan nomor WhatsApp perangkat pengirim langsung pada baris antrean,
-- agar laporan tetap menampilkan nomor pengirim walau sesi perangkat sudah
-- terputus atau terhapus.
alter table public.message_queue add column if not exists sender_phone text;
