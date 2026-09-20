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
        //
        // KEAMANAN: token pengguna HANYA dipakai untuk membuktikan siapa
        // pemanggilnya dan membaca baris perangkatnya. Semua penulisan status
        // antrean, klaim nomor, dan pembayaran reward memakai klien server
        // (adminClient) dengan pemilik perangkat yang dibaca dari database,
        // sehingga pengguna tidak perlu (dan tidak boleh) punya hak tulis ke
        // antrean maupun fungsi reward lewat API database.
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

        // Perangkat HANYA mengirim bila pemiliknya sudah menekan Start pada
        // perangkat tersebut (saklar "siap blast" aktif). Tidak ada lagi
        // pengiriman otomatis meskipun ada kampanye kolam yang berjalan.
        const sess = session as { blast_ready?: boolean | null; blast_speed?: string | null };
        if (!sess.blast_ready) {
          return json({ ok: true, running: false, claimed: 0, sent: 0, failed: 0, remaining: 0 });
        }

        const { processBlastTick } = await import("@/lib/member-worker.server");
        const result = await processBlastTick(
          adminClient,
          parsed.data.session_id,
          sess.blast_speed ?? "santai",
          session.user_id,
        );
        return json({ ok: true, running: true, ...result });
      },
    },
  },
});
