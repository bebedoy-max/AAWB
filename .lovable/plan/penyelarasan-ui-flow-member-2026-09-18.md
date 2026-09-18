# Penyelarasan UI Flow Member

## Tujuan
Menyamakan empat halaman member dengan referensi yang diberikan tanpa mengubah flow admin atau fungsi data yang sudah berjalan.

## Perubahan
- Rapikan sidebar desktop: logo/identitas “Member Dashboard”, empat menu, status aktif, serta identitas member di bagian bawah.
- Susun header desktop agar kotak tanggal dan jam benar-benar berada di tengah; pindahkan status perangkat ke dalam kotak yang sama di sisi kiri sesuai crop referensi. Kontrol tema dan akun tetap di sisi kanan.
- Beranda: samakan proporsi banner sambutan, panel aturan profil, dan tiga kotak ringkasan.
- WhatsApp: samakan judul, panel aturan profil, ringkasan kuota, tombol tambah perangkat, enam statistik, serta area daftar/kondisi kosong; seluruh aksi pairing tetap berfungsi.
- Klaim Saldo: susun saldo dan pengajuan dalam dua kolom, tampilkan kondisi rekening kosong atau formulir pada area yang sama, serta riwayat dengan tab status.
- Tim Afiliasi: susun kartu kode undangan di kiri, statistik di kanan, dan tabel riwayat di bawah.
- Buat tata letak tetap rapi pada layar kecil tanpa mengubah flow admin.

## Logika yang dipertahankan
- Data perangkat, pairing QR/kode, status gateway, saldo, rekening, penarikan, referral, dan riwayat tetap memakai sumber serta aksi yang sekarang.
- Tampilan kosong mengikuti referensi hanya ketika datanya memang kosong.
- Batas perangkat tetap mengikuti batas aplikasi yang saat ini berjalan.

## Verifikasi
- Masuk sebagai member dan periksa langsung Beranda, WhatsApp, Klaim Saldo, dan Tim Afiliasi pada desktop.
- Periksa versi mobile untuk memastikan header, sidebar, kotak, tombol, dan teks tidak bertumpuk.
- Uji tombol utama dan cek tidak ada error halaman maupun konsol.
