# Perbaikan CTA satu pesan dan pemilih emoji

## Perubahan
- Ubah jalur cadangan GOWS agar gambar, caption, teks CTA, dan URL dikirim dalam satu pesan, bukan dua pesan terpisah.
- Pertahankan tombol native sebagai pilihan utama hanya bila mesin WhatsApp mendukungnya.
- Tambahkan tombol pemilih emoji sejajar sebelum tombol `{{name}}` dan `{{phone}}` pada editor kampanye.
- Pastikan pratinjau mencerminkan hasil aktual saat GOWS menggunakan CTA tautan di dalam caption.

## Pengujian
- Buka editor kampanye dan uji penyisipan emoji pada posisi kursor.
- Kirim variasi pesan melalui UI/jalur kampanye ke nomor uji satu per satu.
- Pastikan setiap penerima mendapat satu pesan berisi gambar, caption yang sesuai, serta teks CTA dan URL yang dapat diklik.
- Periksa hasil kompilasi dan catatan pengiriman setelah perubahan.

## Catatan teknis
Mesin WhatsApp yang aktif adalah GOWS dan menolak tombol native WAHA. Agar tidak lagi menjadi dua pesan, fallback akan menempatkan teks CTA dan URL yang dapat diklik di bagian bawah caption gambar yang sama.
