#!/usr/bin/env node
/**
 * Bersihkan sesi YATIM di gateway WhatsApp.
 *
 * Sesi yatim = sesi yang ada di gateway tetapi tidak punya baris di `wa_sessions`. Sesi seperti ini
 * tertinggal karena dulu tombol "Hapus perangkat" hanya membuang baris database dan tidak pernah
 * menghapus sesinya di gateway. Sesi yatim memenuhi disk dan memperlambat gateway, tetapi tidak
 * bisa ditemukan lagi lewat aplikasi karena id-nya sudah hilang dari database.
 *
 * SYARAT HAPUS (ketiganya harus terpenuhi, dicek per sesi):
 *   1. Tidak punya baris di `wa_sessions`.
 *   2. Status di gateway STOPPED atau FAILED (tidak pernah menyentuh sesi WORKING/SCAN_QR_CODE).
 *   3. Tidak punya nomor terpasang (`me` kosong) — sesi bernomor tidak pernah disentuh.
 *
 * BAWAAN: mode uji (tidak menghapus apa pun). Tambahkan --hapus untuk benar-benar menghapus.
 *
 * Cara pakai (jalankan di [SSH VPS] atau komputer yang bisa menjangkau gateway dan Supabase):
 *
 *   export GATEWAY_URL="https://wb.contoh.web.id"
 *   export GATEWAY_API_KEY="..."
 *   export SUPABASE_URL="https://api.contoh.web.id"
 *   export SUPABASE_SERVICE_ROLE_KEY="..."
 *
 *   node scripts/bersihkan-sesi-yatim.mjs                 # mode uji, lihat dulu
 *   node scripts/bersihkan-sesi-yatim.mjs --hapus --batas=200
 *
 * Pilihan:
 *   --hapus          benar-benar menghapus (tanpa ini hanya menampilkan)
 *   --batas=N        maksimal N sesi dihapus dalam satu jalan (bawaan 200)
 *   --jeda=MS        jeda antar penghapusan dalam milidetik (bawaan 250)
 *   --laporan=BERKAS simpan daftar sesi yang dihapus ke berkas (bawaan sesi-yatim-<tanggal>.txt)
 *
 * Jangan menempel kunci ke dalam berkas ini; pakai variabel lingkungan seperti di atas.
 */

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};

const DRY_RUN = !has("--hapus");
const LIMIT = Number(value("--batas", "200"));
const DELAY_MS = Number(value("--jeda", "250"));
const REPORT = value("--laporan", `sesi-yatim-${new Date().toISOString().slice(0, 10)}.txt`);

const GATEWAY_URL = (process.env.GATEWAY_URL || "").replace(/\/+$/, "");
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

for (const [name, v] of Object.entries({
  GATEWAY_URL,
  GATEWAY_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
})) {
  if (!v) {
    console.error(`Variabel lingkungan ${name} belum diisi. Lihat komentar di atas berkas ini.`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Semua id perangkat yang ada di database, diambil per halaman. */
async function idPerangkatDiDatabase() {
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/wa_sessions?select=id`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase menjawab HTTP ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    for (const r of rows) ids.add(String(r.id));
    if (rows.length < PAGE) break;
  }
  return ids;
}

/** Semua sesi yang tersimpan di gateway. */
async function sesiDiGateway() {
  const res = await fetch(`${GATEWAY_URL}/api/sessions?all=true`, {
    headers: { "X-Api-Key": GATEWAY_API_KEY },
  });
  if (!res.ok) throw new Error(`Gateway menjawab HTTP ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Gateway tidak mengembalikan daftar sesi.");
  return rows;
}

async function hapusSesi(name) {
  // Dihentikan dulu agar socket-nya benar-benar tertutup sebelum berkasnya dibuang.
  await fetch(`${GATEWAY_URL}/api/sessions/${encodeURIComponent(name)}/stop`, {
    method: "POST",
    headers: { "X-Api-Key": GATEWAY_API_KEY },
  }).catch(() => undefined);
  const res = await fetch(`${GATEWAY_URL}/api/sessions/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { "X-Api-Key": GATEWAY_API_KEY },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
}

const AMAN_DIHAPUS = new Set(["STOPPED", "FAILED"]);

async function main() {
  console.log(DRY_RUN ? "MODE UJI: tidak ada yang dihapus.\n" : "MODE HAPUS AKTIF.\n");

  const [idDatabase, sesi] = await Promise.all([idPerangkatDiDatabase(), sesiDiGateway()]);

  const perStatus = {};
  for (const s of sesi) {
    const st = String(s.status ?? "UNKNOWN").toUpperCase();
    perStatus[st] = (perStatus[st] ?? 0) + 1;
  }

  const yatim = [];
  const dilewati = { punyaBaris: 0, statusAktif: 0, punyaNomor: 0 };
  for (const s of sesi) {
    const name = String(s.name ?? "");
    if (!name) continue;
    if (idDatabase.has(name)) {
      dilewati.punyaBaris += 1;
      continue;
    }
    const status = String(s.status ?? "UNKNOWN").toUpperCase();
    if (!AMAN_DIHAPUS.has(status)) {
      dilewati.statusAktif += 1;
      continue;
    }
    if (s.me && s.me.id) {
      dilewati.punyaNomor += 1;
      continue;
    }
    yatim.push({ name, status });
  }

  console.log(`Sesi di gateway   : ${sesi.length}`);
  console.log(`Baris di database : ${idDatabase.size}`);
  console.log(`Per status        : ${JSON.stringify(perStatus)}`);
  console.log("");
  console.log(`Dilewati (punya baris database) : ${dilewati.punyaBaris}`);
  console.log(`Dilewati (status bukan STOPPED/FAILED) : ${dilewati.statusAktif}`);
  console.log(`Dilewati (punya nomor terpasang) : ${dilewati.punyaNomor}`);
  console.log(`YATIM dan aman dihapus : ${yatim.length}`);
  console.log("");

  if (!yatim.length) {
    console.log("Tidak ada yang perlu dibersihkan.");
    return;
  }

  const target = yatim.slice(0, LIMIT);
  console.log(`Contoh 10 pertama: ${target.slice(0, 10).map((x) => x.name).join(", ")}`);
  console.log(`Akan diproses kali ini: ${target.length} dari ${yatim.length}`);

  if (DRY_RUN) {
    writeFileSync(REPORT, target.map((x) => `${x.name}\t${x.status}`).join("\n"), "utf8");
    console.log(`\nDaftar lengkap ditulis ke ${REPORT}.`);
    console.log("Jalankan ulang dengan --hapus bila daftar ini sudah benar.");
    return;
  }

  let ok = 0;
  let gagal = 0;
  const terhapus = [];
  for (const [i, s] of target.entries()) {
    try {
      await hapusSesi(s.name);
      ok += 1;
      terhapus.push(`${s.name}\t${s.status}`);
    } catch (err) {
      gagal += 1;
      console.error(`  gagal ${s.name}: ${err.message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${target.length} diproses…`);
    await sleep(DELAY_MS);
  }

  writeFileSync(REPORT, terhapus.join("\n"), "utf8");
  console.log(`\nSelesai. Dihapus: ${ok}, gagal: ${gagal}. Daftar di ${REPORT}.`);
  if (yatim.length > target.length) {
    console.log(`Masih tersisa ${yatim.length - target.length} sesi yatim. Jalankan lagi bila perlu.`);
  }
}

main().catch((err) => {
  console.error(`\nBerhenti: ${err.message}`);
  process.exit(1);
});
