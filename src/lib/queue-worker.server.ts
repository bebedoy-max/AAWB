/**
 * Queue worker. Pulls due rows from message_queue and sends them through the
 * user's WhatsApp gateway continuously, without any automatic pausing,
 * random cooldown or internal rate limiting. Pacing comes only from the
 * campaign's own min/max delay setting, which is baked into scheduled_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { GatewayError, reconnectSession, sendMessage, sessionStatus } from "@/lib/wa-gateway.server";
import { isInvalidNumberError } from "@/lib/anti-ban";
import type { CampaignStatus, MediaType, QueuedMessage, TemplateButton } from "@/types/wa";

export const MAX_ATTEMPTS = 3;

/** How long a single tick may keep draining the queue before returning. */
const TICK_BUDGET_MS = 25_000;
const RETRY_BASE_DELAY_MS = 5_000;

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
  anti_ban?: boolean | null;
}


export interface TickResult {
  processed: number;
  sent: number;
  failed: number;
  status: CampaignStatus;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Memastikan perangkat tersambung; mencoba menyambungkan ulang bila perlu. */
async function ensureConnected(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ connected: boolean; error?: string }> {
  try {
    let live = await sessionStatus(sessionId);
    if (live.status !== "connected") {
      live = await reconnectSession(sessionId);
    }
    await supabase
      .from("wa_sessions")
      .update({
        status: live.status,
        phone_number: live.phone,
        battery_level: live.battery,
        last_ping: live.status === "connected" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    return { connected: live.status === "connected" };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Status perangkat tidak dapat diperiksa",
    };
  }
}

/** Runs one worker tick for a single campaign, draining as much as it can. */
export async function processCampaignTick(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  batchSize = 200,
): Promise<TickResult> {
  if (campaign.status !== "running") {
    return { processed: 0, sent: 0, failed: 0, status: campaign.status };
  }

  if (!campaign.session_id) {
    // Kampanye kolam: tidak terikat satu perangkat, dikerjakan oleh perangkat
    // Worker's lewat jalur blast member. Jangan pernah ditandai gagal di sini.
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      status: "running",
      error: "Kampanye kolam — dikerjakan oleh perangkat Worker's",
    };
  }

  const sessionId = campaign.session_id;
  const first = await ensureConnected(supabase, sessionId);
  if (!first.connected) {
    // Never pause the campaign: keep it running so the next tick continues
    // automatically as soon as the device is back.
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      status: "running",
      error:
        first.error ??
        "Perangkat WhatsApp belum terhubung — pengiriman akan mencoba lagi otomatis",
    };
  }

  // Recover rows claimed by a tick that never finished (worker restart,
  // timeout, closed browser tab), otherwise the queue would stall.
  await supabase
    .from("message_queue")
    .update({ status: "pending" })
    .eq("campaign_id", campaign.id)
    .eq("status", "processing")
    .lt("scheduled_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());

  const startedAt = Date.now();
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let note: string | undefined;

  // Continuous loop: keep pulling the next due rows until the queue is empty
  // or this tick runs out of its time budget.
  while (Date.now() - startedAt < TICK_BUDGET_MS) {
    const { data: batch } = await supabase
      .from("message_queue")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(batchSize);

    const queue = (batch ?? []) as QueuedMessage[];

    if (queue.length === 0) {
      // Nothing due right now: if the next message is due very soon, wait for
      // it inside this tick so fast speeds keep flowing without extra delay.
      const { data: next } = await supabase
        .from("message_queue")
        .select("scheduled_at")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!next) break;
      const waitMs = new Date(next.scheduled_at as string).getTime() - Date.now();
      const remaining = TICK_BUDGET_MS - (Date.now() - startedAt);
      if (waitMs > remaining) {
        note = "Menunggu jadwal pesan berikutnya";
        break;
      }
      await sleep(Math.max(50, waitMs));
      continue;
    }

    for (const item of queue) {
      if (Date.now() - startedAt >= TICK_BUDGET_MS) break;

      const { data: claimed } = await supabase
        .from("message_queue")
        .update({ status: "processing" })
        .eq("id", item.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      const attempts = item.attempts + 1;
      processed += 1;
      try {
        await sendMessage({
          sessionId,
          to: item.recipient_phone,
          text: item.message_body,
          mediaUrl: campaign.media_url,
          // Bila kampanye punya gambar tetapi jenis medianya tertinggal "text",
          // gambar tetap dikirim (bukan berubah jadi pesan teks saja).
          mediaType:
            campaign.media_url && (!campaign.media_type || campaign.media_type === "text")
              ? "image"
              : (campaign.media_type ?? null),
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
        try {
          await supabase.rpc("credit_message_reward", { _message_id: item.id });
        } catch {
          // Reward gagal dicatat tidak boleh menggagalkan pengiriman.
        }
        sent += 1;
      } catch (err) {
        const message =
          err instanceof GatewayError ? err.message : ((err as Error).message ?? "Pengiriman gagal");
        const deliveryUnknown = err instanceof GatewayError && err.deliveryUnknown;

        if (deliveryUnknown) {
          // Hasil pengiriman tidak dapat dipastikan. Jangan pernah mengulang
          // otomatis karena pesan mungkin sudah diterima sebelum socket putus.
          await supabase
            .from("message_queue")
            .update({
              status: "failed",
              attempts,
              error_log: message,
            })
            .eq("id", item.id);
          failed += 1;
          // The socket is shared by the whole device. Stop this tick instead
          // of hammering the same broken transport with every queued row.
          await supabase
            .from("wa_sessions")
            .update({ status: "disconnected", updated_at: new Date().toISOString() })
            .eq("id", sessionId);
          note = "Koneksi perangkat terputus. Pengiriman berikutnya menunggu perangkat pulih.";
          break;
        }

        if (attempts < MAX_ATTEMPTS) {
          // Beri socket waktu pulih. Retry langsung memperparah putus-sambung
          // dan menghasilkan rangkaian error yang sama dalam hitungan detik.
          await supabase
            .from("message_queue")
            .update({
              status: "pending",
              attempts,
              error_log: `${message} (percobaan ${attempts}/${MAX_ATTEMPTS})`,
              scheduled_at: new Date(Date.now() + RETRY_BASE_DELAY_MS * attempts).toISOString(),
            })
            .eq("id", item.id);
        } else {
          // Nomor ini dilewati dan dicatat gagal; loop tetap lanjut.
          await supabase
            .from("message_queue")
            .update({ status: "failed", attempts, error_log: message })
            .eq("id", item.id);
          failed += 1;
          // Anti Ban: nomor tidak valid / tidak aktif ditandai agar tidak
          // dicoba terus-menerus pada kampanye berikutnya.
          if (campaign.anti_ban && isInvalidNumberError(message)) {
            await supabase
              .from("suppression_list")
              .upsert(
                {
                  user_id: campaign.user_id,
                  phone: item.recipient_phone,
                  reason: "invalid",
                  note: message.slice(0, 300),
                } as never,
                { onConflict: "user_id,phone" },
              );
          }
        }
      }
    }

    if (note) break;

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

  return { processed, sent, failed, status, ...(note ? { error: note } : {}) };
}
