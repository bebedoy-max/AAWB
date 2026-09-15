# Panduan Hosting di Cloudflare Pages

Build sudah otomatis mengenali Cloudflare Pages dan menghasilkan folder `dist`
(berisi `_worker.js` untuk bagian server + file statis). Tidak perlu file
konfigurasi tambahan di repo — file `wrangler.toml` sebelumnya justru membuat
deploy gagal ("The name 'ASSETS' is reserved in Pages projects") dan sudah dihapus.

**Catatan (update):** Nitro (lewat preset `cloudflare-pages`) ternyata tetap
men-generate ulang `dist/_worker.js/wrangler.json` di setiap build, walau file
itu sudah dihapus dari repo — dan file hasil generate itu tetap memuat binding
bernama `ASSETS`, yang bentrok dengan binding `ASSETS` bawaan Cloudflare Pages.
Karena itu error yang sama bisa muncul lagi meski repo sudah bersih. Untuk
mengatasinya, ada script `scripts/strip-cf-pages-wrangler-config.mjs` yang
dijalankan otomatis lewat hook `postbuild` di `package.json` — script ini
menghapus `wrangler.json` hasil generate itu setelah `vite build` selesai,
sehingga Cloudflare Pages kembali memakai binding `ASSETS` bawaannya sendiri
(yang memang sudah sesuai dengan yang dipakai runtime Nitro).

## 1. Pengaturan build di Cloudflare Pages

**Penting:** kalau **Framework preset** TIDAK diset ke `None`, Cloudflare Pages
akan memakai build command bawaan presetnya sendiri dan **mengabaikan**
script `build`/`postbuild` di `package.json` — inilah penyebab paling umum
error "The name 'ASSETS' is reserved..." tetap muncul meski
`scripts/strip-cf-pages-wrangler-config.mjs` sudah ada di repo. Pastikan
keempat kolom di bawah ini diisi PERSIS seperti ini di **Settings → Builds &
deployments**, lalu jalankan **Retry deployment** (bukan cuma save):

| Kolom | Isi |
| --- | --- |
| Framework preset | None |
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |
| Root directory | kosongkan |

Variabel build (opsional): `NODE_VERSION = 22`.

## 2. Variabel & secret yang harus diisi

Settings → **Environment variables** (isi untuk Production dan Preview),
tandai sebagai **Secret** untuk yang rahasia:

| Nama | Keterangan |
| --- | --- |
| `MY_SUPABASE_URL` | URL project Supabase Anda, mis. `https://xxxx.supabase.co` |
| `MY_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key Supabase |
| `MY_SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase (rahasia) |
| `WA_CRON_SECRET` | Kata sandi bebas buatan Anda, dipakai penjadwal antrean |

Opsional (cadangan saja; normalnya diatur dari menu Admin di aplikasi):
`WA_GATEWAY_URL`, `WA_GATEWAY_API_KEY`.

Setelah menambah variabel, jalankan **Retry deployment** agar terpakai.

## 3. Deploy dari komputer sendiri (alternatif)

```sh
npm install
npm run build
npx wrangler pages deploy dist --project-name=<nama-project-anda>
```

## 4. Setelah deploy

1. Jalankan sekali isi `db/migrations/001_roles_and_app_settings.sql` di Supabase → SQL Editor
   (kalau belum dijalankan).
2. Supabase → Authentication → URL Configuration: tambahkan domain Cloudflare Anda ke
   **Site URL** dan **Redirect URLs** supaya login berfungsi.
3. Penjadwal antrean memanggil `POST https://domain-anda/api/public/cron/process-queue`
   dengan header `Authorization: Bearer <WA_CRON_SECRET>`. Arahkan penjadwal Supabase
   (pg_cron) ke domain Cloudflare Anda.
4. Buka menu Admin dan isi alamat + API key gateway WhatsApp.
