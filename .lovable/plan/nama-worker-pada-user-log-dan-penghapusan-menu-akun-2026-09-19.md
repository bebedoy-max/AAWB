# Nama Worker pada User Log dan Penghapusan Menu Akun

## Hasil yang dibangun
- Kolom **Pengguna** pada User Log menampilkan nama worker, bukan alamat email internal.
- Data log lama maupun baru mengambil nama worker terbaru dari data profil pengguna.
- Menu dan panel **Akun** di Pengaturan Sistem admin dihapus sepenuhnya.

## Teknis
- Perkaya hasil daftar aktivitas dengan nama dari profil berdasarkan ID pengguna, dengan fallback aman jika nama belum tersedia.
- Perbarui pencarian User Log agar dapat mencari berdasarkan nama worker.
- Bersihkan state, impor, dan tampilan panel Akun yang tidak lagi digunakan.

## Verifikasi
- Jalankan pemeriksaan tipe.
- Pastikan tidak ada menu atau panel Akun tersisa dan tabel tetap memiliki paginasi 20 baris.
