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

        const startedAt = Date.now();
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

              const tick = await processBlastTick(
                supabaseAdmin,
                device.id,
                row.blast_speed ?? device.blast_speed ?? "santai",
                device.user_id,
              );
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

        return json({ ok: true, running_campaigns: running, devices: devices.length, results });
      },
    },
  },
});
