/**
 * Real queue worker. Pulls due rows from message_queue and sends them
 * through the user's Baileys gateway, with retries and anti-ban pacing.
 * Shared by the interactive dispatcher and the background cron route.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { backoffMs } from "@/lib/whatsapp";
import { GatewayError, sendMessage, sessionStatus } from "@/lib/wa-gateway.server";
import type { CampaignStatus, MediaType, QueuedMessage, TemplateButton } from "@/types/wa";

export const MAX_ATTEMPTS = 3;

export interface CampaignRow {
  id: string;
  user_id: string;
  session_id: string | null;
  status: CampaignStatus;
  media_url: string | null;
  media_type?: MediaType | null;
  media_filename?: string | null;
  footer_text?: string | null;
  buttons_json?: TemplateButton[] | null;
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

  // The database status is only a mirror and can become stale after a gateway
  // restart or a dropped phone connection. Always verify the live session
  // before sending so we never burn retries against a non-WORKING session.
  let liveStatus: "connected" | "connecting" | "disconnected" = "disconnected";
  let sessionError: string | undefined;
  try {
    const liveSession = await sessionStatus(campaign.session_id);
    liveStatus = liveSession.status;
    await supabase
      .from("wa_sessions")
      .update({
        status: liveSession.status,
        phone_number: liveSession.phone,
        battery_level: liveSession.battery,
        last_ping: liveSession.status === "connected" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.session_id);
  } catch (err) {
    sessionError = err instanceof Error ? err.message : "Status perangkat tidak dapat diperiksa";
  }

  if (liveStatus !== "connected") {
    await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaign.id);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      status: "paused",
      error: sessionError ?? "Perangkat WhatsApp tidak terhubung — kampanye dijeda",
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
  let pausedForSession = false;

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
        mediaType: campaign.media_type ?? null,
        mediaFilename: campaign.media_filename ?? null,
        footerText: campaign.footer_text ?? null,
        buttons: campaign.buttons_json ?? null,
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
      if (/session status is not as expected/i.test(message)) {
        await supabase
          .from("message_queue")
          .update({
            status: "pending",
            attempts: item.attempts,
            error_log: "Perangkat terputus saat pengiriman; pesan menunggu perangkat tersambung kembali",
          })
          .eq("id", item.id);
        await supabase
          .from("wa_sessions")
          .update({ status: "disconnected", last_ping: null, updated_at: new Date().toISOString() })
          .eq("id", campaign.session_id);
        await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaign.id);
        pausedForSession = true;
        break;
      }
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
  if (pausedForSession) {
    status = "paused";
  } else if ((remaining ?? 0) === 0) {
    status = "completed";
    await supabase.from("campaigns").update({ status }).eq("id", campaign.id);
  }

  return { processed: queue.length, sent, failed, status };
}
