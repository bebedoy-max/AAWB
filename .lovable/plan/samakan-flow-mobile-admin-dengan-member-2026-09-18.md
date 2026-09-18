# Samakan Flow Mobile Admin dengan Member

## Tujuan
Membuat pengalaman admin di ponsel mengikuti pola mobile member, dengan navigasi utama hanya ke Ringkasan, Pengguna, Laporan, dan Klaim Dana. Tampilan admin desktop tetap seperti sekarang.

## Perubahan
- Tambahkan susunan menu khusus admin mobile berisi tepat empat tujuan:
  - Ringkasan (`/admin`)
  - Pengguna (`/admin/pengguna`)
  - Laporan (`/admin/laporan`)
  - Klaim Dana (`/admin/klaim`)
- Ganti header admin versi ponsel dengan header mengambang bergaya sama seperti member, termasuk informasi tanggal/bahasa dan kontrol akun yang relevan.
- Tambahkan navigasi bawah admin berbentuk empat ikon, memakai penanda halaman aktif yang sama seperti flow member.
- Sembunyikan hamburger dan bar menu admin horizontal pada layar ponsel; keduanya tetap tersedia tanpa perubahan pada desktop.
- Samakan ruang atas, ruang bawah, tipografi, permukaan, dan perilaku tata letak mobile admin dengan shell mobile member agar konten tidak tertutup header atau navigasi bawah.
- Pertahankan seluruh tombol tindakan pada halaman admin. Pembatasan hanya berlaku pada menu yang terlihat di ponsel; halaman admin lain tetap dapat diakses melalui URL langsung.

## Validasi
- Periksa Ringkasan, Pengguna, Laporan, dan Klaim Dana pada ukuran ponsel.
- Pastikan empat ikon navigasi membuka halaman yang benar dan status aktifnya akurat.
- Pastikan tabel, filter, tombol tindakan, header, dan navigasi bawah tidak bertumpuk atau terpotong.
- Periksa admin desktop untuk memastikan header dan menu lengkap tetap sama.

## Detail teknis
- Perubahan utama dilakukan pada shell aplikasi dan menggunakan breakpoint CSS yang sudah dipakai flow member.
- Tidak ada perubahan pada backend, database, hak akses, maupun proses data.
