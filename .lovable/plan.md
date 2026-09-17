# Perbaikan pairing perangkat via kode

## Temuan
Gateway aktif memakai WAHA 2026.8.2 dengan mesin **NOWEB**. Kode aplikasi sudah memakai endpoint dan format nomor yang benar. Namun, perubahan keamanan WhatsApp terbaru dapat meminta tahap passkey setelah kode dimasukkan. Di WAHA, tahap ini belum didukung oleh NOWEB; dukungan tersedia pada mesin GOWS. Itu menjelaskan mengapa QR berhasil tetapi pairing kode ditolak setelah kode diterima.

## Perubahan aplikasi
- Baca versi, mesin, dan status pairing langsung dari gateway.
- Jangan menampilkan kode yang diketahui tidak dapat diselesaikan pada mesin NOWEB ketika alur membutuhkan passkey.
- Tampilkan status khusus dan petunjuk yang tepat jika WhatsApp meminta passkey, alih-alih terus menunggu atau meminta kode baru.
- Pertahankan QR sebagai opsi yang tetap berfungsi.
- Tambahkan pemeriksaan sesudah kode dibuat agar dialog otomatis mendeteksi berhasil, gagal, kedaluwarsa, atau membutuhkan passkey.

## Perubahan gateway yang diperlukan
- Ubah `WHATSAPP_DEFAULT_ENGINE` dari `NOWEB` menjadi `GOWS`, lalu mulai ulang WAHA.
- Sesi baru yang dibuat setelah perubahan akan memakai GOWS. Sesi lama tidak akan diputus atau dihapus otomatis oleh aplikasi.

## Verifikasi
- Pastikan pemeriksaan gateway membaca WAHA 2026.8.2 dan mesin aktif.
- Uji pembuatan kode pada sesi baru.
- Pastikan UI mengikuti status sampai `WORKING`, atau memberi pesan passkey yang spesifik tanpa menyatakan pairing berhasil.
