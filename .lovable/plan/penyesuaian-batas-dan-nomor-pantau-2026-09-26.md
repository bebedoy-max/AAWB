# Penyesuaian Batas dan Nomor Pantau

## Perubahan

- Izinkan nilai `0` pada **Batas per jam**, tampilkan keterangannya sebagai tanpa batas, dan pastikan proses pengiriman melewati pemeriksaan batas jam saat nilainya `0`.
- Hapus seluruh tampilan dan pemuatan data **Sasaran pantau** dari menu Nomor Pantau; aturan pemantauan lain tetap dipertahankan.
- Ubah **Riwayat pantau** menjadi 10 baris per halaman dengan navigasi halaman.
- Tambahkan tombol **Clear** di kanan atas Riwayat pantau, dengan dialog konfirmasi, untuk menghapus seluruh riwayat.

## Teknis

- Sesuaikan validasi nilai batas per jam dari `1–1000` menjadi `0–1000` pada form dan proses server.
- Tambahkan fungsi khusus admin untuk menghapus data riwayat pantau, lalu segarkan daftar dan kembali ke halaman pertama.
- Gunakan kontrol tombol dan dialog yang sudah tersedia agar tampilan tetap konsisten.

## Verifikasi

- Pastikan nilai `0` dapat disimpan dan tidak menghentikan pengiriman berdasarkan jumlah per jam.
- Pastikan Sasaran pantau tidak lagi muncul atau dimuat di halaman.
- Pastikan riwayat menampilkan maksimal 10 baris, navigasi halaman bekerja, dan Clear mengosongkan tabel setelah konfirmasi.