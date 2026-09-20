import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { json } from "@/lib/supabase-user.server";

/**
 * Pekerja blast sisi server. Dipanggil terus-menerus oleh penjadwal database
 * (pg_cron) sehingga pengiriman tetap berjalan walaupun tidak ada browser
 * worker yang terbuka. Setiap perangkat yang sudah ditekan "Start" oleh
 * worker dijalankan pada alur sendiri dan tidak saling menunggu.
 */
const RUN_BUDGET_MS = 50_000;

/**
 * Penjadwal eksternal (cron-job.org) hanya menunggu sekitar 30 detik lalu menandai
 * panggilan sebagai GAGAL (timeout), sedangkan satu putaran pekerja bisa berjalan
 * sampai RUN_BUDGET_MS. Karena itu putaran dijalankan di LATAR BELAKANG dan
 * panggilan langsung dijawab 202. Status berhasil/gagal di penjadwal kembali
 * bermakna: gagal berarti otorisasi, konfigurasi, atau database bermasalah.
 *
 * Penanda putaran berjalan hidup di memori satu proses. Bila putaran sebelumnya
 * macet lebih lama dari STALE_RUN_MS, putaran baru boleh dimulai. Putaran yang
 * tumpang tindih aman: pesan dikunci per baris di database (tidak terkirim ganda).
 */
const STALE_RUN_MS = 120_000;
let activeRunStartedAt = 0; // 0 = tidak ada putaran yang sedang berjalan

export const Route = createFileRoute("/api/public/cron/blast-devices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WA_CRON_SECRET"];
        if (!secret) return json({ error: "Scheduler not configured" }, 500);

        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
        if (!token || !timingSafeEqual(digest(token), digest(secret))) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
        // Kolom blast_ready/blast_speed ditambahkan lewat migrasi, belum ada di tipe hasil generate.
        const supabaseAdmin = typedAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
        const { processBlastTick } = await import("@/lib/member-worker.server");
        const { PROCESSING_TIMEOUT, RETRY_MAX_ATTEMPTS } = await import("@/lib/blast-retry");

        // Sapuan pesan macet (dijalankan tiap panggilan cron, walau tidak ada kampanye berjalan):
        // baris "processing" tanpa konfirmasi lebih dari 5 menit dianggap gagal SEMENTARA dan
        // dikembalikan ke antrean agar dikirim lagi (oleh perangkat lain) sampai berhasil, atau
        // ditutup gagal bila batas percobaan habis.
        try {
          const { data: swept, error: sweepError } = await supabaseAdmin.rpc("sweep_stale_processing", {
            _max_age: PROCESSING_TIMEOUT,
            _max_attempts: RETRY_MAX_ATTEMPTS,
          });
          if (sweepError) {
            console.error("[blast-devices] sapuan pesan macet gagal (migrasi 024 sudah dijalankan?):", sweepError.message);
          } else if (Number(swept) > 0) {
            console.log(`[blast-devices] sapuan: ${swept} pesan macet dikembalikan ke antrean`);
          }
        } catch (error) {
          console.error("[blast-devices] sapuan pesan macet gagal:", error instanceof Error ? error.message : error);
        }

        // Tidak ada kampanye berjalan → tidak ada pekerjaan.
        const { count: running } = await supabaseAdmin
          .from("campaigns")
          .select("id", { count: "exact", head: true })
          .eq("status", "running");
        if (!running) return json({ ok: true, running_campaigns: 0, devices: 0 });

        const { data: sessions, error } = await supabaseAdmin
          .from("wa_sessions")
          .select("id,user_id,blast_speed")
          .eq("blast_ready", true)
          .limit(50);
        if (error) return json({ error: error.message }, 500);

        const devices = (sessions ?? []) as Array<{
          id: string;
          user_id: string;
          blast_speed: string | null;
        }>;
        if (!devices.length) return json({ ok: true, running_campaigns: running, devices: 0 });

        // Putaran sebelumnya masih berjalan (mis. anggaran 50 detik belum habis): lewati.
        if (activeRunStartedAt && Date.now() - activeRunStartedAt < STALE_RUN_MS) {
          return json({ ok: true, started: false, reason: "putaran sebelumnya masih berjalan" }, 202);
        }
        const runToken = Date.now();
        activeRunStartedAt = runToken;

        void (async () => {
          const startedAt = Date.now();
          try {
            const results = await Promise.all(
              devices.map(async (device) => {
                let sent = 0;
                let failed = 0;
                let claimed = 0;
                let lastError: string | undefined;
                // Loop per perangkat: terus mengirim sampai anggaran waktu habis,
                // perangkat dihentikan worker, atau kampanye tidak berjalan lagi.
                while (Date.now() - startedAt < RUN_BUDGET_MS) {
                  const { data: fresh } = await supabaseAdmin
                    .from("wa_sessions")
                    .select("blast_ready,blast_speed")
                    .eq("id", device.id)
                    .maybeSingle();
                  const row = (fresh ?? null) as {
                    blast_ready?: boolean | null;
                    blast_speed?: string | null;
                  } | null;
                  if (!row?.blast_ready) break;

                  let tick: Awaited<ReturnType<typeof processBlastTick>>;
                  try {
                    tick = await processBlastTick(
                      supabaseAdmin,
                      device.id,
                      row.blast_speed ?? device.blast_speed ?? "santai",
                      device.user_id,
                    );
                  } catch (error) {
                    // Galat satu perangkat tidak boleh menghentikan perangkat lain.
                    lastError = error instanceof Error ? error.message : String(error);
                    console.error(`[blast-devices] perangkat ${device.id} gagal:`, lastError);
                    break;
                  }
                  sent += tick.sent;
                  failed += tick.failed;
                  claimed += tick.claimed;
                  if (tick.error) lastError = tick.error;
                  // Perangkat belum siap kirim (misal sedang tersambung ulang):
                  // beri jeda singkat lalu coba lagi, jangan dimatikan.
                  if (!tick.sent && !tick.claimed) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                  }
                }
                return { session_id: device.id, sent, failed, claimed, error: lastError };
              }),
            );
            const total = results.reduce(
              (acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed }),
              { sent: 0, failed: 0 },
            );
            console.log(
              `[blast-devices] putaran selesai: ${devices.length} perangkat, terkirim=${total.sent}, gagal=${total.failed}`,
            );
          } catch (error) {
            console.error("[blast-devices] putaran gagal:", error instanceof Error ? error.message : error);
          } finally {
            if (activeRunStartedAt === runToken) activeRunStartedAt = 0;
          }
        })();

        return json(
          { ok: true, started: true, running_campaigns: running, devices: devices.length },
          202,
        );
      },
    },
  },
});
