<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Nilai `blast_hourly_cap = 0` berarti tanpa batas per jam; pemeriksaan batas hanya aktif untuk nilai di atas nol, agar pengaturan admin konsisten dengan batas harian.
- Sidebar Worker desktop memakai posisi tetap dan area konten diberi offset selebar sidebar, agar navigasi tidak bergerak saat halaman digulir.
- User Log tetap mengecualikan aktivitas rutin Super Admin, tetapi selalu mencatat reset kata sandi dan keputusan penarikan karena keduanya perlu jejak audit.
- Penamaan perangkat kosong memakai helper bersama yang membaca nama Worker dari profil dan memilih nomor terkecil yang belum dipakai, agar Dashboard dan halaman WhatsApp konsisten.
- Penjelasan koneksi perangkat berasal dari status dan pembatasan gateway; jangan menyimpulkan blokir atau mengarang masa tunggu dari status terputus saja, agar Worker menerima informasi yang dapat dipercaya.
- Pengiriman kampanye memiliki satu alur per ID sesi perangkat (bukan per nomor), sementara pengaturan admin membatasi jumlah sesi aktif per nomor dan batas pesan jam/hari tetap dihitung per nomor; agar empat perangkat bernomor sama dapat bekerja serentak tanpa mengirim satu tugas dua kali.
