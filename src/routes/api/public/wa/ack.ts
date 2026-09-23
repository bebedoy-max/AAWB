/**
 * Penerima tanda terima (ack) pesan dari gateway WhatsApp.
 *
 * Gunanya: memastikan laporan jujur. Status "sent" di antrean hanya berarti
 * gateway menerima perintah kirim; baris ini yang membuktikan pesan benar-benar
 * sampai ke HP penerima (device) atau sudah dibaca (read).
 *
 * Setelan di WAHA: webhook event `message.ack` diarahkan ke
 *   https://<domain-app>/api/public/wa/ack
 * dengan header `x-wa-secret` berisi WA_CRON_SECRET.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** WAHA: 1 = terkirim ke server, 2 = sampai ke perangkat, 3/4 = dibaca. */
const ackSchema = z.object({
  event: z.string().optional(),
  payload: z
    .object({
      id: z.string().optional(),
      ackName: z.string().optional(),
      ack: z.number().optional(),
    })
    .optional(),
  // Bentuk ringkas (bila gateway dikonfigurasi manual).
  id: z.string().optional(),
  ack: z.number().optional(),
  ackName: z.string().optional(),
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function levelOf(ack: number | undefined, name: string | undefined): "server" | "device" | "read" | null {
  const label = (name ?? "").toUpperCase();
  if (label === "READ" || label === "PLAYED") return "read";
  if (label === "DEVICE") return "device";
  if (label === "SERVER") return "server";
  if (ack === undefined) return null;
  if (ack >= 3) return "read";
  if (ack === 2) return "device";
  if (ack === 1) return "server";
  return null;
}

const RANK = { server: 1, device: 2, read: 3 } as const;

export const Route = createFileRoute("/api/public/wa/ack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WA_CRON_SECRET"];
        const given = request.headers.get("x-wa-secret") ?? "";
        if (!secret || !safeEqual(given, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const parsed = ackSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad Request", { status: 400 });
        const body = parsed.data;
        const messageId = body.payload?.id ?? body.id;
        const level = levelOf(body.payload?.ack ?? body.ack, body.payload?.ackName ?? body.ackName);
        if (!messageId || !level) return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const admin = supabaseAdmin as any;

        const { data: row } = await admin
          .from("message_queue")
          .select("id,delivery_status")
          .eq("provider_message_id", messageId)
          .maybeSingle();
        if (!row) return Response.json({ ok: true, matched: false });

        // Tanda terima hanya boleh naik tingkat, tidak turun (urutannya bisa terbalik).
        const current = row.delivery_status as "server" | "device" | "read" | null;
        if (current && RANK[current] >= RANK[level]) {
          return Response.json({ ok: true, unchanged: true });
        }

        const now = new Date().toISOString();
        const patch: Record<string, unknown> = { delivery_status: level };
        if (level === "device" || level === "read") patch["delivered_at"] = now;
        if (level === "read") patch["read_at"] = now;

        const { error } = await admin.from("message_queue").update(patch).eq("id", row.id);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true, level });
      },
    },
  },
});
