# Panduan Mengaktifkan Login & Registrasi dengan Google

Domain aplikasi: **https://aawb.web.id**
Domain Supabase self-hosted (contoh, ganti sesuai milik Anda): **https://supabase.aawb.web.id**

Sisi aplikasi sudah siap. Yang tinggal dilakukan adalah pengaturan di Google Cloud
dan di Supabase self-hosted (Coolify).

---

## 1. Buat kredensial di Google Cloud

1. Buka https://console.cloud.google.com → pilih/buat project.
2. Menu **APIs & Services → OAuth consent screen**:
   - User type: **External**, lalu **Publish app** (kalau masih Testing, hanya email
     yang Anda daftarkan sebagai Test user yang bisa masuk).
   - Scope cukup bawaan: `email`, `profile`, `openid`.
   - Authorized domain: `aawb.web.id`
3. Menu **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins:**
     - `https://aawb.web.id`
     - `https://supabase.aawb.web.id`
   - **Authorized redirect URIs** (WAJIB, alamat Supabase Anda, bukan alamat aplikasi):
     - `https://supabase.aawb.web.id/auth/v1/callback`
4. Simpan **Client ID** dan **Client Secret**.

---

## 2. Variabel di Supabase self-hosted (Coolify)

Buka service Supabase di Coolify → **Environment Variables**, isi/perbarui:

| Nama | Nilai |
| --- | --- |
| `GOTRUE_EXTERNAL_GOOGLE_ENABLED` | `true` |
| `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` | Client ID dari Google |
| `GOTRUE_EXTERNAL_GOOGLE_SECRET` | Client Secret dari Google |
| `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` | `https://supabase.aawb.web.id/auth/v1/callback` |
| `API_EXTERNAL_URL` | `https://supabase.aawb.web.id` |
| `GOTRUE_SITE_URL` / `SITE_URL` | `https://aawb.web.id` |
| `GOTRUE_URI_ALLOW_LIST` | `https://aawb.web.id,https://aawb.web.id/*,https://aawb.web.id/auth/callback` |
| `GOTRUE_EXTERNAL_EMAIL_ENABLED` | `true` (login email/kata sandi tetap jalan) |
| `GOTRUE_DISABLE_SIGNUP` | `false` (agar registrasi via Google diizinkan) |

Catatan penting:

- `API_EXTERNAL_URL` harus **persis** sama dengan domain HTTPS Supabase Anda,
  karena nilai inilah yang dipakai saat mengarahkan pengguna ke Google.
- Kalau template Supabase di Coolify memakai nama tanpa awalan (`GOOGLE_ENABLED`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET`, `GOOGLE_REDIRECT_URI`), isi keduanya saja
  agar aman.
- Setelah menyimpan, lakukan **Redeploy/Restart** pada service Supabase (khususnya
  container **auth/gotrue**), lalu cek log auth: tidak boleh ada peringatan tentang
  provider Google.

### Kalau memakai `docker-compose` bawaan Supabase

Bagian `auth` perlu meneruskan variabel tersebut, contoh:

```yaml
  auth:
    environment:
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOTRUE_EXTERNAL_GOOGLE_ENABLED}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOTRUE_EXTERNAL_GOOGLE_SECRET}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI}
```

---

## 3. Pastikan domain Supabase bisa diakses publik lewat HTTPS

Google akan memanggil `https://supabase.aawb.web.id/auth/v1/callback` dari luar,
jadi domain itu harus:

- punya sertifikat HTTPS aktif (Coolify → Domains, aktifkan SSL),
- tidak diproteksi Basic Auth / IP allow-list,
- meneruskan jalur `/auth/v1/*` ke gateway Kong Supabase.

Uji cepat dari terminal mana pun:

```sh
curl -i https://supabase.aawb.web.id/auth/v1/settings
```

Jawaban harus JSON dan memuat `"google": true` pada bagian `external`.

---

## 4. Data pengguna baru dari Google

Pengguna yang mendaftar lewat Google tidak mengisi nama organisasi, jadi pastikan
migrasi `db/migrations/001_roles_and_app_settings.sql` sudah dijalankan di
Supabase → SQL Editor. Trigger di dalamnya membuat baris profil otomatis dan
memakai nama dari Google bila tersedia.

---

## 5. Uji coba

1. Buka `https://aawb.web.id/auth`.
2. Klik **Lanjutkan dengan Google** → pilih akun.
3. Anda akan kembali ke `https://aawb.web.id/auth/callback`, lalu otomatis masuk ke
   halaman **Dashboard**.

### Bila gagal

| Pesan / gejala | Penyebab & solusi |
| --- | --- |
| `redirect_uri_mismatch` dari Google | Redirect URI di Google Cloud belum sama persis dengan `https://supabase.aawb.web.id/auth/v1/callback` |
| `Unsupported provider: provider is not enabled` | Variabel `..._GOOGLE_ENABLED` belum `true` atau service auth belum di-restart |
| Kembali ke halaman login tanpa pesan | `SITE_URL`/`URI_ALLOW_LIST` belum memuat `https://aawb.web.id/auth/callback` |
| Setelah pilih akun malah muncul error 404 | `API_EXTERNAL_URL` masih memakai `http://localhost:8000` |
| `Signups not allowed` | `GOTRUE_DISABLE_SIGNUP` masih `true` |
