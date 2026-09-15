# Panduan Hosting di Cloudflare

Aplikasi ini adalah app full-stack (ada kode server: login, gateway WhatsApp, cron antrean),
jadi hostingnya memakai **Cloudflare Workers** (menu "Workers & Pages" → Workers).
Cloudflare Pages versi statis tidak cukup, karena bagian server tidak akan jalan.
Kalau Anda membuat project dari Git di dashboard, pilih **Workers** / "Import a repository"
dan biarkan Cloudflare memakai `wrangler.toml` yang sudah ada di project ini.

## 1. Pengaturan build di Cloudflare

| Kolom | Isi |
| --- | --- |
| Build command | `npm install && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Output / assets directory | `dist/client` (sudah diatur di `wrangler.toml`) |
| Root directory | `/` (kosongkan) |
| Node version | 20 atau 22 (`NODE_VERSION = 22`) |

File `wrangler.toml` sudah menunjuk ke:
- server: `dist/server/index.mjs`
- file statis: `dist/client`
- `nodejs_compat` aktif (wajib, dipakai oleh kode server)

## 2. Variabel & secret yang harus diisi

Isi di **Workers → project Anda → Settings → Variables and Secrets**.

Wajib (isi sebagai **Secret**):

| Nama | Keterangan |
| --- | --- |
| `MY_SUPABASE_URL` | URL project Supabase Anda, mis. `https://xxxx.supabase.co` |
| `MY_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key Supabase |
| `MY_SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase (rahasia, jangan dibagikan) |
| `WA_CRON_SECRET` | Kata sandi bebas yang Anda buat sendiri, dipakai penjadwal antrean |

Opsional (hanya cadangan kalau tabel pengaturan belum diisi; normalnya diatur dari menu Admin):

| Nama | Keterangan |
| --- | --- |
| `WA_GATEWAY_URL` | Alamat gateway WhatsApp |
| `WA_GATEWAY_API_KEY` | API key gateway WhatsApp |

Catatan: alamat dan API key gateway sebaiknya diisi lewat **menu Admin** di aplikasi,
bukan lewat variabel ini.

## 3. Deploy dari komputer sendiri (alternatif)

```sh
npm install
npx wrangler login
npm run deploy            # build + deploy sekaligus
```

Mengisi secret dari terminal:

```sh
npx wrangler secret put MY_SUPABASE_URL
npx wrangler secret put MY_SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put MY_SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put WA_CRON_SECRET
```

Untuk menjalankan versi produksi secara lokal: `npm run build && npm run cf:dev`.

## 4. Setelah deploy

1. Jalankan sekali isi `db/migrations/001_roles_and_app_settings.sql` di Supabase → SQL Editor
   (kalau belum dijalankan).
2. Di Supabase → Authentication → URL Configuration, tambahkan domain Cloudflare Anda
   ke **Site URL** dan **Redirect URLs**, supaya login berfungsi.
3. Penjadwal antrean memanggil `POST https://domain-anda/api/public/cron/process-queue`
   dengan header `Authorization: Bearer <WA_CRON_SECRET>`. Perbarui alamat ini di
   penjadwal Supabase (pg_cron) agar menunjuk ke domain Cloudflare Anda.
4. Buka menu Admin dan isi alamat + API key gateway WhatsApp.
