# Roadmap

- [x] Sederhanakan landing page tanpa informasi blast WhatsApp.
- [x] Buat login dan registrasi wizard berbasis username.
- [x] Jamin username unik melalui identitas akun internal tanpa mengubah struktur database.
- [x] Sesuaikan tampilan shell, beranda, WhatsApp, klaim saldo, dan tim afiliasi member.
- [x] Pastikan admin tetap masuk ke flow admin.
- [x] Uji tampilan dan alur utama.
## Penyesuaian visual member sesuai referensi terbaru

- [x] Satukan indikator perangkat ke dalam kotak tanggal/jam di sisi kiri.
- [x] Pusatkan kotak tanggal/jam pada header desktop.
- [x] Samakan layout Beranda, WhatsApp, Klaim Saldo, dan Tim Afiliasi dengan referensi.
- [x] Pertahankan seluruh alur dan aksi data yang sudah berfungsi.
- [x] Verifikasi visual keempat halaman pada desktop dan mobile dengan sesi aktif.

## Penyelarasan warna dan keterbacaan

- [x] Terapkan palet Neon Mint pada area member dengan permukaan gelap yang serasi.
- [x] Tingkatkan kontras seluruh teks pada panel peringatan dan informasi saldo.
- [x] Terapkan komposisi Modern Dark Dashboard yang dipilih.
- [x] Verifikasi tampilan dashboard dan klaim saldo pada desktop dan mobile.

## Konsistensi pesan kampanye

- [x] Hapus kolom tautan gambar dari formulir tambah kampanye.
- [x] Simpan gambar unggahan sebagai media gambar, bukan pesan teks.
- [x] Verifikasi nyata gambar dan isi pesan pada enam nomor uji; seluruh kiriman diterima gateway.
- [x] Verifikasi CTA: mesin GOWS menolak tombol native, sehingga otomatis terkirim sebagai tautan klik.
- [x] Simpan CTA sebagai data tombol dan teruskan melalui jalur blast member.
- [x] Kenali format gambar dari isi file agar MIME/ekstensi tidak salah saat dikirim.
- [x] Satukan CTA fallback ke caption gambar agar GOWS mengirim satu pesan saja.
- [x] Tambahkan pemilih emoji sebelum tombol variabel nama dan telepon.

## Penyamaan tampilan mobile member

- [x] Samakan header mobile dan navigasi bawah dengan referensi.
- [x] Samakan halaman Beranda, WhatsApp, Klaim Saldo, Tim Afiliasi, dan Pengaturan pada mobile.
- [x] Pertahankan tampilan desktop dan seluruh fungsi data yang sudah berjalan.
- [x] Verifikasi setiap halaman pada ukuran ponsel tanpa teks atau elemen bertumpuk.

## Penyamaan tampilan mobile admin

- [x] Terapkan header dan navigasi bawah bergaya flow member pada admin mobile.
- [x] Batasi menu admin mobile ke Ringkasan, Pengguna, Laporan, dan Klaim Dana.
- [x] Verifikasi empat halaman admin pada mobile dan pastikan desktop tidak berubah.
- [x] Cegah judul dan panel admin menyempit menjadi satu karakter per baris pada layar ponsel.

## Tabel mobile admin (detail pop-up)
- [x] Tabel pengguna mobile: hanya Pengguna, Saldo, Terkirim; email dihapus dari tabel (semua tampilan)
- [x] Klik baris pengguna membuka pop-up detail semua kolom + tindakan (peran, reset sandi, hapus)
- [x] Tabel riwayat pengiriman mobile: hanya Waktu, Pengirim, Status; klik baris membuka pop-up detail lengkap
# Perbaikan error gateway
- [x] Temukan akar masalah status sesi dan koneksi WebSocket
- [x] Perbaiki penanganan koneksi, pengiriman, dan pesan error
- [x] Hentikan pemrosesan satu perangkat segera setelah socket putus agar error tidak berantai
- [x] Cegah dua halaman/tab menjalankan pekerja blast yang sama secara bersamaan
- [x] Bersihkan 27 sesi gateway yatim; verifikasi tidak ada sesi FAILED tersisa
- [x] Uji siklus create → start → SCAN_QR_CODE → cleanup langsung ke gateway
- [ ] Uji pengiriman pesan nyata (menunggu pengguna memasangkan minimal satu perangkat)

## Perbaikan pekerja kampanye otomatis
- [x] Izinkan pekerja global admin menjalankan perangkat member setelah verifikasi peran server.
- [x] Klaim antrean kolam atas nama pemilik perangkat pada jalur otomatis global.
- [ ] Verifikasi antrean nyata berpindah dari menunggu ke terkirim (terblokir: perangkat "00000000" masih menunggu pemindaian QR dan "A1" terputus).
