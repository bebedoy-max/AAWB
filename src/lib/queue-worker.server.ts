/**
 * Real queue worker. Pulls due rows from message_queue and sends them
 * through the user's Baileys gateway, with retries and anti-ban pacing.
 * Shared by the interactive dispatcher and the background cron route.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { backoffMs } from "@/lib/whatsapp";
import { GatewayError, sendMessage } from "@/lib/wa-gateway.server";
import type { CampaignStatus, QueuedMessage } from "@/types/wa";

export const MAX_ATTEMPTS = 3;

export interface CampaignRow {
  id: string;
  user_id: string;
  session_id: string | null;
  status: CampaignStatus;
  media_url: string | null;
}

export interface TickResult {
  processed: number;
  sent: number;
  failed: number;
  status: CampaignStatus;
  error?: string;
}

/** Runs one worker tick for a single campaign. */
export async function processCampaignTick(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  batchSize = 5,
): Promise<TickResult> {
  if (campaign.status !== "running") {
    return { processed: 0, sent: 0, failed: 0, status: campaign.status };
  }

  if (!campaign.session_id) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaign.id);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      status: "failed",
      error: "Tidak ada perangkat WhatsApp yang dipilih untuk kampanye ini",
    };
  }

  const { data: device } = await supabase
    .from("wa_sessions")
    .select("id,status")
    .eq("id", campaign.session_id)
    .maybeSingle();

  if (!device || device.status !== "connected") {
    await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaign.id);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      status: "paused",
      error: "Perangkat WhatsApp tidak terhubung — kampanye dijeda",
    };
  }

  const { data: batch } = await supabase
    .from("message_queue")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(batchSize);

  const queue = (batch ?? []) as QueuedMessage[];
  let sent = 0;
  let failed = 0;

  for (const item of queue) {
    await supabase
      .from("message_queue")
      .update({ status: "processing" })
      .eq("id", item.id)
      .eq("status", "pending");

    const attempts = item.attempts + 1;
    try {
      await sendMessage({
        sessionId: campaign.session_id,
        to: item.recipient_phone,
        text: item.message_body,
        mediaUrl: campaign.media_url,
      });
      await supabase
        .from("message_queue")
        .update({
          status: "sent",
          attempts,
          sent_at: new Date().toISOString(),
          error_log: null,
        })
        .eq("id", item.id);
      sent += 1;
    } catch (err) {
      const message =
        err instanceof GatewayError ? err.message : ((err as Error).message ?? "Pengiriman gagal");
      if (attempts < MAX_ATTEMPTS) {
        await supabase
          .from("message_queue")
          .update({
            status: "pending",
            attempts,
            error_log: `${message} (retry ${attempts}/${MAX_ATTEMPTS})`,
            scheduled_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
          })
          .eq("id", item.id);
      } else {
        await supabase
          .from("message_queue")
          .update({ status: "failed", attempts, error_log: message })
          .eq("id", item.id);
        failed += 1;
      }
    }
  }

  const { count: remaining } = await supabase
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .in("status", ["pending", "processing"]);

  let status: CampaignStatus = "running";
  if ((remaining ?? 0) === 0) {
    status = "completed";
    await supabase.from("campaigns").update({ status }).eq("id", campaign.id);
  }

  return { processed: queue.length, sent, failed, status };
}
