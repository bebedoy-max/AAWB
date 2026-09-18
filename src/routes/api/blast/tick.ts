import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, unauthorized, userClientFromRequest } from "@/lib/supabase-user.server";

const payloadSchema = z.object({ session_id: z.string().uuid() });

/**
 * Satu tick pekerja blast member: klaim nomor dari kolam proyek admin lalu
 * kirim melalui perangkat member. Berhenti bila member menekan Stop.
 */
export const Route = createFileRoute("/api/blast/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = userClientFromRequest(request);
        if (!supabase) return unauthorized();

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Data permintaan tidak valid" }, 400);

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) return unauthorized();

        // Pemilik perangkat boleh menjalankan perangkatnya sendiri. Admin juga
        // boleh menjalankan pekerja otomatis global, tetapi hanya setelah
        // perannya diverifikasi dari server.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const adminClient = supabaseAdmin as unknown as typeof supabase;
        const { data: roleRows } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        const isAdmin = ((roleRows ?? []) as Array<{ role: string }>).some(
          (row) => row.role === "admin" || row.role === "super_admin",
        );
        const sessionClient = isAdmin ? adminClient : supabase;
        const { data: session } = await sessionClient
          .from("wa_sessions")
          .select("id,user_id,blast_ready,blast_speed")
          .eq("id", parsed.data.session_id)
          .maybeSingle();
        if (!session || (!isAdmin && session.user_id !== userId)) {
          return json({ error: "Perangkat tidak ditemukan" }, 404);
        }

        // Perangkat mengirim bila saklar "siap blast" aktif, ATAU otomatis
        // saat ada kampanye kolam yang sedang berjalan (deteksi otomatis:
        // kampanye berjalan + perangkat aktif = pengiriman lanjut sendiri).
        const sess = session as { blast_ready?: boolean | null; blast_speed?: string | null };
        if (!sess.blast_ready) {
          const { count } = await (supabaseAdmin as unknown as typeof supabase)
            .from("campaigns")
            .select("id", { count: "exact", head: true })
            .eq("is_pool", true)
            .eq("status", "running");
          if (!count) {
            return json({ ok: true, running: false, claimed: 0, sent: 0, failed: 0, remaining: 0 });
          }
        }

        const { processBlastTick } = await import("@/lib/member-worker.server");
        const result = await processBlastTick(
          isAdmin ? adminClient : supabase,
          parsed.data.session_id,
          sess.blast_speed ?? "santai",
          isAdmin ? session.user_id : undefined,
        );
        return json({ ok: true, running: true, ...result });
      },
    },
  },
});
