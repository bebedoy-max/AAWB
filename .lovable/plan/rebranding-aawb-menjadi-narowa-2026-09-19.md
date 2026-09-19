# Rebranding AAWB menjadi NAROWA

## Perubahan
- Simpan logo NAROWA sebagai aset aplikasi agar tetap termuat di preview dan semua hosting.
- Ganti logo lama pada halaman publik, area worker, dan konsol admin.
- Buat ikon tab baru dari logo NAROWA.
- Ganti seluruh label, judul halaman, deskripsi, pesan, dan nama pengirim bawaan yang terlihat dari AAWB menjadi NAROWA.
- Pertahankan penanda internal lama yang dibutuhkan akun dan proses berjalan agar tidak merusak login atau data pengguna.
- Periksa tampilan utama serta memastikan aplikasi tetap berhasil dimuat.

## Detail teknis
- Logo utama akan disajikan melalui aset CDN proyek, bukan jalur yang bergantung pada host tertentu.
- Ikon tab tetap berupa berkas kecil lokal agar kompatibel dengan browser dan hosting.
- Alamat akun internal `@member.aawb.local`, kunci penyimpanan, nama lock, dan format kata sandi lama tidak diubah karena bukan label pengguna dan diperlukan untuk kompatibilitas data lama.
