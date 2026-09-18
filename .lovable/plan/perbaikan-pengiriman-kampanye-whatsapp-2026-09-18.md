# Perbaikan pengiriman kampanye WhatsApp

## Tujuan
Memastikan hasil kirim mengikuti pratinjau kampanye: gambar utuh, caption yang sudah dipersonalisasi, lalu tombol CTA yang dapat diketuk.

## Langkah
1. Satukan penyimpanan CTA ke kolom tombol kampanye sekaligus mempertahankan pembacaan format kampanye lama.
2. Teruskan media, caption, footer, dan tombol melalui jalur blast member tanpa kehilangan data.
3. Sesuaikan format permintaan gateway berdasarkan kemampuan WAHA agar media dan tombol terkirim dengan isi yang sama; jika tombol native tidak didukung, gunakan tautan teks yang jelas tanpa menghilangkan gambar.
4. Tambahkan pencatatan hasil tiap tahap agar kegagalan gambar atau tombol tidak tersamarkan sebagai sukses.
5. Uji dari antarmuka dengan enam nomor yang diberikan, memakai variasi pesan, dan periksa hasil pengiriman serta catatan server.

## Batas keberhasilan
- Gambar terkirim dan tidak dipotong oleh aplikasi.
- Caption sama dengan isi kampanye setelah variabel nomor diganti.
- Tombol CTA tampil dan dapat diketuk, atau fallback tautannya terlihat jika mesin WhatsApp memang menolak tombol native.
- Antarmuka hanya menandai sukses setelah seluruh bagian yang diwajibkan berhasil dikirim.
