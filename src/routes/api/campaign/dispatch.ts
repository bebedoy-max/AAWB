import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, unauthorized, userClientFromRequest } from "@/lib/supabase-user.server";
import { buildMessageBody, randomDelay, sanitizePhone } from "@/lib/whatsapp";
import type { CampaignStatus } from "@/types/wa";

const payloadSchema = z.object({
  campaign_id: z.string().uuid(),
  action: z.enum(["enqueue", "process", "pause", "resume", "abort"]),
});

const BATCH_PER_TICK = 5;

/**
 * Campaign dispatcher. `enqueue` materialises the audience into
 * message_queue with anti-ban staggering; `process` runs one worker tick
 * sending through the real Baileys gateway, with pacing and retries.
 */
export const Route = createFileRoute("/api/campaign/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = userClientFromRequest(request);
        if (!supabase) return unauthorized();

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Data permintaan tidak valid" }, 400);
        const { campaign_id, action } = parsed.data;

        const { data: campaign, error: campaignError } = await supabase
          .from("campaigns")
          .select("*")
          .eq("id", campaign_id)
          .maybeSingle();
        if (campaignError) return json({ error: campaignError.message }, 400);
        if (!campaign) return json({ error: "Kampanye tidak ditemukan" }, 404);

        if (action === "pause" || action === "resume" || action === "abort") {
          const status: CampaignStatus =
            action === "pause" ? "paused" : action === "resume" ? "running" : "failed";
          await supabase.from("campaigns").update({ status }).eq("id", campaign_id);
          if (action === "abort") {
            await supabase
              .from("message_queue")
              .update({ status: "failed", error_log: "Dibatalkan oleh pengguna" })
              .eq("campaign_id", campaign_id)
              .in("status", ["pending", "processing"]);
          }
          return json({ ok: true, status });
        }

        if (action === "enqueue") {
          const { count: existing } = await supabase
            .from("message_queue")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign_id);
          if ((existing ?? 0) > 0) {
            await supabase.from("campaigns").update({ status: "running" }).eq("id", campaign_id);
            return json({ ok: true, queued: 0, status: "running", message: "Sudah masuk antrean" });
          }

          let query = supabase.from("contacts").select("id,name,phone,metadata_json");
          if (campaign.group_id) query = query.eq("group_id", campaign.group_id);
          const { data: contacts, error: contactsError } = await query.limit(
            campaign.batch_limit ?? 500,
          );
          if (contactsError) return json({ error: contactsError.message }, 400);
          if (!contacts?.length) return json({ error: "Tidak ada kontak dalam daftar penerima ini" }, 400);

          let template = {
            content: "",
            media_url: null as string | null,
            media_type: "text" as string,
            media_filename: null as string | null,
            footer_text: null as string | null,
            buttons_json: [] as unknown,
          };
          if (campaign.template_id) {
            const { data: tpl } = await supabase
              .from("templates")
              .select("content,media_url,media_type,media_filename,footer_text,buttons_json")
              .eq("id", campaign.template_id)
              .maybeSingle();
            if (tpl) template = { ...template, ...(tpl as unknown as typeof template) };
          }

          const startAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date();
          let cursor = startAt.getTime();

          const rows = contacts.map((contact) => {
            const meta = (contact.metadata_json ?? {}) as Record<string, string>;
            cursor += randomDelay(campaign.min_delay, campaign.max_delay) * 1000;
            return {
              user_id: campaign.user_id,
              campaign_id,
              recipient_phone: sanitizePhone(contact.phone),
              message_body: buildMessageBody(template.content, {
                name: contact.name,
                phone: sanitizePhone(contact.phone),
                ...meta,
              }),
              status: "pending" as const,
              scheduled_at: new Date(cursor).toISOString(),
            };
          });

          const { error: insertError } = await supabase.from("message_queue").insert(rows);
          if (insertError) return json({ error: insertError.message }, 400);

          await supabase
            .from("campaigns")
            .update({
              status: campaign.scheduled_at ? "paused" : "running",
              total_targets: rows.length,
              media_url: template.media_url,
              media_type: template.media_type ?? "text",
              media_filename: template.media_filename,
              footer_text: template.footer_text,
              buttons_json: template.buttons_json ?? [],
            } as never)
            .eq("id", campaign_id);

          return json({ ok: true, queued: rows.length, status: "running" });
        }

        // action === "process": one rate-limited worker tick against the real gateway.
        const { processCampaignTick } = await import("@/lib/queue-worker.server");
        const tick = await processCampaignTick(
          supabase,
          {
            id: campaign.id,
            user_id: campaign.user_id,
            session_id: campaign.session_id,
            status: campaign.status as CampaignStatus,
            media_url: campaign.media_url,
            media_type: (campaign as unknown as Record<string, never>)["media_type"] ?? null,
            media_filename: (campaign as unknown as Record<string, never>)["media_filename"] ?? null,
            footer_text: (campaign as unknown as Record<string, never>)["footer_text"] ?? null,
            buttons_json: (campaign as unknown as Record<string, never>)["buttons_json"] ?? null,
          },
          BATCH_PER_TICK,
        );

        return json({ ok: true, ...tick });
      },
    },
  },
});
