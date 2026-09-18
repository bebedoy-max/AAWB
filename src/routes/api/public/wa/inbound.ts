/**
 * Penerima balasan masuk dari gateway WhatsApp.
 *
 * Dipakai untuk Anti Ban: nomor yang membalas STOP / BERHENTI / UNSUB otomatis
 * masuk daftar penyaringan (suppression list) dan tidak akan dikirimi pesan lagi.
 *
 * Gateway harus mengirim header `x-wa-secret` berisi WA_CRON_SECRET.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isStopMessage } from "@/lib/anti-ban";
import { sanitizePhone } from "@/lib/whatsapp";

const payloadSchema = z.object({
  session_id: z.string().min(1),
  from: z.string().min(5),
  text: z.string().default(""),
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/wa/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WA_CRON_SECRET"];
        const given = request.headers.get("x-wa-secret") ?? "";
        if (!secret || !safeEqual(given, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad Request", { status: 400 });
        const { session_id, from, text } = parsed.data;

        if (!isStopMessage(text)) return Response.json({ ok: true, suppressed: false });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
            };
            upsert: (
              row: Record<string, unknown>,
              opts: { onConflict: string },
            ) => Promise<{ error: { message: string } | null }>;
          };
        };
        const phone = sanitizePhone(from);

        const { data: session } = await admin
          .from("wa_sessions")
          .select("user_id")
          .eq("id", session_id)
          .maybeSingle();
        if (!session) return new Response("Not Found", { status: 404 });

        const { error } = await admin.from("suppression_list").upsert(
          {
            user_id: (session as { user_id: string }).user_id,
            phone,
            reason: "stop",
            note: text.slice(0, 300),
          },
          { onConflict: "user_id,phone" },
        );
        if (error) return new Response(error.message, { status: 500 });


        return Response.json({ ok: true, suppressed: true });
      },
    },
  },
});
