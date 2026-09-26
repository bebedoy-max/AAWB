# Info Telegram, hasil reset sandi, dan User Log

## Yang akan dibuat
- Tambahkan informasi akun Telegram tertaut pada pop-up Detail Pengguna: nama Telegram, username, ID Telegram, dan waktu penautan. Bila belum tertaut, tampilkan status yang jelas.
- Setelah admin berhasil mereset kata sandi, tutup formulir reset lalu tampilkan pop-up di tengah halaman berisi nama pengguna, username, dan kata sandi baru. Kata sandi hanya ditampilkan dari input saat itu dan tidak disimpan ke log atau database tambahan.
- Perkaya User Log dengan nama aktivitas yang mudah dipahami dan keterangan yang menyebut pengguna/nominal terkait, termasuk penarikan berhasil atau ditolak, admin mereset kata sandi pengguna, Worker mengubah kata sandi, serta aktivitas lain yang sebenarnya sudah dicatat tetapi belum memiliki label ramah.

## Detail teknis
- Perluas hasil detail pengguna dari data `telegram_links` tanpa perubahan struktur database.
- Pertahankan dialog reset yang ada dan tambahkan state hasil sukses terpisah; username diambil dari akun Worker (`...@member.aawb.local`).
- Catat perubahan kata sandi mandiri melalui pencatat aktivitas server yang sudah ada, tanpa pernah merekam kata sandinya.
- Perbarui keterangan persetujuan penarikan agar memuat nama Worker dan nominal, bukan hanya ID pengajuan.
- Pastikan tindakan admin yang diminta dapat tampil di User Log dan sesuaikan teks penjelasannya.

## Pemeriksaan
- Pastikan aplikasi lolos pemeriksaan kode.
- Uji halaman publik yang tersedia dan cek tampilan berbasis kode; halaman admin/Worker yang membutuhkan sesi akan dicatat bila tidak dapat diuji langsung.
