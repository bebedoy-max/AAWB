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
