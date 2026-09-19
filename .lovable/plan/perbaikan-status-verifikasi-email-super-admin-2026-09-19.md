# Perbaikan status verifikasi email Super Admin

## Perubahan
- Setelah tautan email berhasil diverifikasi, selesaikan perubahan email akun yang sedang masuk secara aman.
- Bersihkan penanda “menunggu verifikasi” agar daftar Tim Manajer langsung menampilkan email baru dan status terverifikasi.
- Pertahankan pemeriksaan bahwa perubahan hanya berlaku untuk akun sendiri dan alamat yang memang sedang menunggu konfirmasi.

## Pemeriksaan
- Pastikan halaman verifikasi tetap menangani tautan token, kode, dan sesi yang sudah diproses otomatis.
- Pastikan halaman kembali mengarahkan pengguna ke halaman sesuai perannya tanpa status memuat tanpa akhir.
