# Pengaturan tema warna global

## Hasil yang dibangun
- Tambahkan menu **Tampilan** pada Pengaturan admin, sejajar dengan menu pengaturan yang ada.
- Tampilkan tujuh opsi tema sesuai nama, urutan, kategori, dan warna utama yang diberikan; pilihan langsung diterapkan dan disimpan.
- Terapkan tema terpilih untuk seluruh halaman admin dan worker melalui atribut `data-app-theme` pada elemen HTML.
- Gunakan `dark-emerald` sebagai nilai bawaan jika pengaturan belum pernah disimpan.

## Penyimpanan dan akses
- Tambahkan satu kolom `app_theme` pada tabel global `app_settings` melalui migrasi baru, tanpa mengubah tabel atau alur lain.
- Tambahkan fungsi baca tema untuk semua pengguna yang sudah masuk dan fungsi simpan yang tetap memeriksa hak admin di server.
- Muat tema global dari aplikasi utama agar pilihan yang sama berlaku untuk Admin dan Worker's; mekanisme light/dark yang sudah ada tetap utuh dan independen.

## Warna dan UI
- Tambahkan ketujuh blok token CSS persis seperti yang diberikan, sesudah blok fallback `:root` dan `.dark`, tanpa mengubah token lama atau token non-warna.
- Picker memakai pola panel Pengaturan yang sudah ada, tanpa mengubah susunan halaman, ukuran, jarak, font, radius, bayangan, navigasi, atau alur UX.
- Setiap opsi menampilkan nama, kategori, titik warna utama, serta status pilihan radio.

## Verifikasi
- Jalankan pemeriksaan otomatis yang relevan.
- Uji ketujuh tema pada **Ringkasan Sistem** admin dan **Beranda** worker menggunakan sesi yang tersedia.
- Periksa keterbacaan teks dan konsistensi warna tanpa melakukan penyesuaian layout.
