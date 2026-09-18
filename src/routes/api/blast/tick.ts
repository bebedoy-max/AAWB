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

        const { data: session } = await supabase
          .from("wa_sessions")
          .select("id,user_id")
          .eq("id", parsed.data.session_id)
          .maybeSingle();
        if (!session || session.user_id !== userId) {
          return json({ error: "Perangkat tidak ditemukan" }, 404);
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("blast_speed,blast_running")
          .eq("user_id", userId)
          .maybeSingle();
        if (!profile?.blast_running) {
          return json({ ok: true, running: false, claimed: 0, sent: 0, failed: 0, remaining: 0 });
        }

        const { processBlastTick } = await import("@/lib/member-worker.server");
        const result = await processBlastTick(
          supabase,
          parsed.data.session_id,
          profile.blast_speed ?? "santai",
        );
        return json({ ok: true, running: true, ...result });
      },
    },
  },
});
