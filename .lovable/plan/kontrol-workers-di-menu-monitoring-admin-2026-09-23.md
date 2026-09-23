# Kontrol Workers di Menu Monitoring Admin

Baris pada tabel "Blaster 60 menit terakhir" jadi bisa diklik. Muncul pop up berisi data lengkap
worker + statistik kampanye berjalan, plus tiga tombol aksi: Test Blast ke nomor pantau, Pause, dan
Kick dari kampanye. Semua aksi hanya untuk admin/super admin.

## Isi pop up detail worker

Bagian 1 — Identitas
- Nama worker, username, email akun
- Nomor WhatsApp perangkat yang dipakai (beserta status: tersambung / didinginkan / terputus)
- Semua nomor perangkat lain milik worker itu
- Akun Telegram yang tertaut (username, tanggal tertaut) atau keterangan "belum tertaut"
- Metode & nomor rekening/e-wallet penarikan (bila sudah diisi)
- Mode kecepatan, golongan (Mapan/Pemanasan), total pesan terkirim sepanjang waktu

Bagian 2 — Per kampanye yang sedang berjalan
Tabel: nama kampanye, jumlah terkirim, gagal, sisa yang dia pegang, dan reward rupiah yang sudah dia
dapat dari kampanye itu. Reward dihitung dari catatan reward yang terhubung ke pesan worker tersebut
di kampanye tersebut, jadi angkanya persis sama dengan saldo yang masuk.

Bagian 3 — Aksi

1. **Test Blast** — admin mengisi nomor pantau, klik "Kirim Test Blast". Perangkat worker langsung
   mengirim satu pesan (isi pesan kampanye berjalan, termasuk gambar/footer bila ada) ke nomor itu,
   sekali saja. Pesan ini **tidak** dibuat sebagai baris antrean, sehingga otomatis: tidak
   menghasilkan reward dan tidak muncul di riwayat/laporan kampanye. Tercatat hanya di log pantau
   dengan alasan `test_blast`. Setelah itu worker lanjut blast ke sisa nomor target seperti biasa.
2. **Pause worker** — mematikan izin blast perangkat itu (tombol start-nya dianggap mati), jadi dia
   berhenti mengambil nomor baru. Tombol berubah jadi "Lanjutkan" untuk menyalakan kembali.
3. **Kick dari kampanye** — worker dikeluarkan dari satu kampanye berjalan: semua nomor yang sedang
   dia pegang di kampanye itu dilepas kembali ke kolam supaya worker lain yang mengerjakan, dan dia
   diblokir mengambil nomor kampanye itu lagi. Bisa dibatalkan (buka blokir) dari pop up yang sama.
   Kampanye lain tidak terpengaruh.

## Rincian teknis

Migrasi baru `db/migrations/032_kontrol_worker_monitor.sql`:
- Tabel `campaign_worker_blocks (campaign_id, user_id, blocked_by, reason, created_at)`, unique
  `(campaign_id, user_id)`, RLS aktif + `grant all ... to service_role` (akses hanya lewat server).
- Perbarui `admin_blast_monitor()` agar setiap baris `blasters` juga membawa `worker_id`
  (`wa_sessions.user_id`) dan `session_id`, supaya baris tabel bisa dipetakan ke worker/perangkat.

Server functions baru `src/lib/worker-control.functions.ts` (semua `.middleware([requireSupabaseAuth])`
+ `assertAdminRole`, input divalidasi zod, klien admin di-`await import` di dalam handler):
- `getWorkerDetail({ workerId, sessionId })` — rakit identitas + statistik per kampanye berjalan +
  daftar blokir aktif.
- `adminTestBlast({ sessionId, phone, campaignId })` — normalisasi nomor, ambil isi pesan kampanye,
  kirim langsung via `sendMessage` dari `wa-gateway.server`, catat ke `monitor_log`
  (`reason: 'test_blast'`). Tidak menyentuh `message_queue` maupun `reward_ledger`.
- `setWorkerBlastEnabled({ sessionId, enabled })` — set `wa_sessions.blast_ready`.
- `setWorkerCampaignBlock({ workerId, campaignId, blocked })` — tulis/hapus baris blokir; saat
  memblokir, lepas baris `message_queue` milik worker itu (status `pending`/`processing`) di kampanye
  tersebut kembali ke kolam (`claimed_by`, `claimed_at`, `session_id`, `attempt_id`, `locked_at`
  dikosongkan, `status = 'pending'`).

Penegakan blokir di `src/lib/member-worker.server.ts`: sesudah klaim batch, baris yang kampanyenya
terblokir untuk pemilik perangkat langsung dikembalikan ke antrean dan dilewati, sehingga aturan
berlaku tanpa mengubah fungsi klaim di database (migrasi 022–026 tidak ada di repo ini).

UI `src/routes/_authenticated/admin.monitor.tsx`: baris tabel blaster jadi `cursor-pointer` dengan
`onClick` membuka `Dialog` baru `src/components/WorkerDetailDialog.tsx` (shadcn `Dialog`, label
Indonesia, `AlertDialog` untuk konfirmasi Kick). Data lewat `useQuery` + `useServerFn`, aksi lewat
`useMutation` lalu invalidasi query monitor dan detail. Notifikasi pakai `sonner` seperti halaman lain.
