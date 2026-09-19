# Profil WhatsApp Global

## Hasil yang dibangun
- Tambahkan bagian **Profil WhatsApp** di Pengaturan Admin untuk mengatur satu nama dan satu foto profil global.
- Simpan nama dan foto tersebut di pengaturan global agar semua worker menerima sumber yang sama.
- Dashboard worker menampilkan foto serta nama aktual dari pengaturan admin, bukan logo/nama akun worker bawaan.
- Tombol **Unduh foto profil** mengunduh foto yang ditetapkan admin dan **Salin nama profil** menyalin nama tersebut.
- Tambahkan tombol **Terapkan ke semua perangkat** yang memasang nama dan foto secara nyata ke seluruh perangkat WhatsApp milik worker yang sedang terhubung.
- Tampilkan hasil penerapan: jumlah perangkat berhasil, gagal, dan perangkat offline yang dilewati.

## Teknis
- Tambahkan dua kolom pada `app_settings`: nama profil dan data foto profil, melalui migrasi baru tanpa mengubah tabel lain.
- Foto divalidasi sebagai JPEG/PNG/WEBP dengan batas ukuran yang aman, lalu disimpan sebagai data gambar global supaya dapat diteruskan langsung ke layanan WhatsApp.
- Fungsi baca profil tersedia untuk semua akun yang sudah masuk; fungsi simpan tetap khusus admin/super admin.
- Fungsi penerapan worker memverifikasi identitas pemanggil, mengambil hanya sesi miliknya, lalu memanggil endpoint profil WhatsApp yang sudah tersedia untuk setiap sesi berstatus `connected`.
- Tidak ada ID pemilik dari browser yang dipercaya; kepemilikan perangkat ditentukan dari sesi login.
- Pertahankan layout dashboard dan alur perangkat yang ada; hanya isi panel profil dan kontrol Pengaturan Admin yang ditambahkan.

## Verifikasi
- Pastikan admin dapat menyimpan, memuat ulang, dan melihat kembali nama/foto.
- Pastikan worker dapat mengunduh foto dan menyalin nama admin.
- Uji penerapan terhadap seluruh perangkat terhubung dan pastikan perangkat offline tidak membuat seluruh proses gagal.
- Jalankan pemeriksaan tipe dan cek tampilan admin/dashboard tanpa error.

## Langkah setelah kode selesai
- Jalankan migrasi SQL baru pada database Supabase milik Anda sebelum penyimpanan profil digunakan.
