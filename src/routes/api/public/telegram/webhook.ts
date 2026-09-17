import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { sendTelegramMessage, webhookSecret } from "@/lib/telegram.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env["TELEGRAM_BOT_TOKEN"]) {
          return new Response("Not configured", { status: 503 });
        }
        const given = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(given, webhookSecret())) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as any;
        const message = update?.message ?? update?.edited_message;
        const chat = message?.chat;
        const text: string = message?.text ?? "";
        if (!chat?.id) return Response.json({ ok: true, ignored: true });

        const startMatch = /^\/start(?:@\w+)?\s+(\S+)/.exec(text.trim());
        if (!startMatch) {
          if (text.trim().startsWith("/start")) {
            await sendTelegramMessage(
              chat.id,
              "Silakan buka halaman <b>Pengaturan</b> di aplikasi lalu tekan <b>Hubungkan Telegram</b> agar akun Anda tersambung.",
            ).catch(() => undefined);
          }
          return Response.json({ ok: true });
        }

        const code = startMatch[1]!;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link } = await (supabaseAdmin as any)
          .from("telegram_links")
          .select("user_id,code_expires_at")
          .eq("link_code", code)
          .maybeSingle();

        if (!link?.user_id) {
          await sendTelegramMessage(chat.id, "Kode tidak dikenal. Buat tautan baru dari halaman Pengaturan.").catch(
            () => undefined,
          );
          return Response.json({ ok: true });
        }
        if (link.code_expires_at && new Date(link.code_expires_at).getTime() < Date.now()) {
          await sendTelegramMessage(chat.id, "Tautan sudah kedaluwarsa. Buat tautan baru dari halaman Pengaturan.").catch(
            () => undefined,
          );
          return Response.json({ ok: true });
        }

        const from = message?.from ?? {};
        const { error } = await (supabaseAdmin as any)
          .from("telegram_links")
          .update({
            chat_id: chat.id,
            username: from.username ?? null,
            first_name: [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
            connected_at: new Date().toISOString(),
            link_code: null,
            code_expires_at: null,
          })
          .eq("user_id", link.user_id);

        if (error) return Response.json({ error: error.message }, { status: 500 });

        await sendTelegramMessage(
          chat.id,
          "✅ Akun Telegram Anda berhasil terhubung dengan AAWB. Notifikasi akan dikirim ke chat ini.",
        ).catch(() => undefined);
        return Response.json({ ok: true });
      },
    },
  },
});
