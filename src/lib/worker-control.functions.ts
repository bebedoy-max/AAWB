/**
 * Kendali worker dari menu Monitor Blast (admin & super admin):
 *  - detail lengkap worker + rapor per kampanye berjalan (terkirim, gagal, sisa, reward)
 *  - Test Blast: satu pesan langsung ke nomor pantau. TIDAK ditulis ke message_queue,
 *    jadi tidak menghasilkan reward dan tidak muncul di laporan kampanye.
 *  - Pause/Lanjutkan perangkat worker (saklar blast_ready)
 *  - Kick worker dari satu kampanye: sisa nomor yang dia pegang dilepas ke kolam dan
 *    dia diblokir mengambil nomor kampanye itu lagi (tabel campaign_worker_blocks).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

async function requireAdmin(context: any, superOnly = false): Promise<void> {
  const { assertAdminRole } = await import("@/lib/admin-guard.server");
  await assertAdminRole(context.userId, superOnly);
}

export interface WorkerDevice {
  id: string;
  phone: string | null;
  status: string | null;
  blast_ready: boolean | null;
  blast_speed: string | null;
  cooldown_until: string | null;
  last_ping: string | null;
}

export interface WorkerCampaignStat {
  id: string;
  name: string;
  test_mode: boolean;
  sent: number;
  failed: number;
  pending: number;
  reward: number;
  last_sent: string | null;
  blocked: boolean;
}

export interface WorkerDetail {
  worker_id: string;
  name: string;
  username: string | null;
  email: string | null;
  telegram: { username: string | null; chat_id: string | null; connected_at: string | null } | null;
  payout: { method: string | null; provider: string | null; number: string | null; name: string | null };
  total_sent: number;
  reward_total: number;
  devices: WorkerDevice[];
  campaigns: WorkerCampaignStat[];
  /** false bila migrasi 032 belum dijalankan di database. */
  migrated: boolean;
}

/** Detail lengkap satu worker beserta rapor kampanye berjalan. Admin & super admin. */
export const getWorkerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workerId: string }) => {
    const workerId = String(input?.workerId ?? "").trim();
    if (!workerId) throw new Error("Worker tidak dikenali.");
    return { workerId };
  })
  .handler(async ({ data, context }): Promise<WorkerDetail> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const workerId = data.workerId;

    const [profileRes, sessionRes, telegramRes, sentRes, rewardRes, userRes] = await Promise.all([
      admin
        .from("profiles")
        .select("organization_name,username,payout_method,payout_provider,payout_number,payout_name")
        .eq("user_id", workerId)
        .maybeSingle(),
      admin
        .from("wa_sessions")
        .select("id,phone_number,status,blast_ready,blast_speed,cooldown_until,last_ping")
        .eq("user_id", workerId)
        .order("updated_at", { ascending: false })
        .limit(20),
      admin
        .from("telegram_links")
        .select("username,chat_id,connected_at")
        .eq("user_id", workerId)
        .maybeSingle(),
      admin
        .from("message_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", workerId)
        .eq("status", "sent"),
      admin.from("reward_ledger").select("amount").eq("user_id", workerId).limit(100000),
      admin.auth.admin.getUserById(workerId),
    ]);

    const profile = (profileRes.data ?? {}) as Record<string, any>;
    const devices = ((sessionRes.data ?? []) as any[]).map((d) => ({
      id: String(d.id),
      phone: d.phone_number ?? null,
      status: d.status ?? null,
      blast_ready: d.blast_ready ?? null,
      blast_speed: d.blast_speed ?? null,
      cooldown_until: d.cooldown_until ?? null,
      last_ping: d.last_ping ?? null,
    }));
    const rewardTotal = ((rewardRes.data ?? []) as { amount: number | string }[]).reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0,
    );

    let campaigns: WorkerCampaignStat[] = [];
    let migrated = true;
    const { data: statsRaw, error: statsError } = await admin.rpc("admin_worker_campaign_stats", {
      _user_id: workerId,
    });
    if (statsError) {
      if (/does not exist|schema cache|function/i.test(statsError.message)) migrated = false;
      else throw new Error(statsError.message);
    } else {
      campaigns = ((statsRaw ?? []) as any[]).map((c) => ({
        id: String(c.id),
        name: String(c.name ?? "—"),
        test_mode: c.test_mode === true,
        sent: Number(c.sent ?? 0),
        failed: Number(c.failed ?? 0),
        pending: Number(c.pending ?? 0),
        reward: Number(c.reward ?? 0),
        last_sent: c.last_sent ?? null,
        blocked: false,
      }));
    }

    if (migrated) {
      const { data: blocks, error: blockError } = await admin
        .from("campaign_worker_blocks")
        .select("campaign_id")
        .eq("user_id", workerId);
      if (blockError && /does not exist|schema cache/i.test(blockError.message)) migrated = false;
      const blocked = new Set(((blocks ?? []) as { campaign_id: string }[]).map((b) => b.campaign_id));
      campaigns = campaigns.map((c) => ({ ...c, blocked: blocked.has(c.id) }));
    }

    const authUser = (userRes as any)?.data?.user ?? null;
    const meta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (profile["organization_name"] as string | null)?.trim() ||
      (meta["full_name"] as string | undefined) ||
      (meta["name"] as string | undefined) ||
      (authUser?.email ? String(authUser.email).split("@")[0] : "") ||
      "Worker";

    const tg = telegramRes.data as Record<string, any> | null;

    return {
      worker_id: workerId,
      name,
      username: (profile["username"] as string | null) ?? null,
      email: authUser?.email ?? null,
      telegram: tg
        ? {
            username: tg["username"] ?? null,
            chat_id: tg["chat_id"] ? String(tg["chat_id"]) : null,
            connected_at: tg["connected_at"] ?? null,
          }
        : null,
      payout: {
        method: (profile["payout_method"] as string | null) ?? null,
        provider: (profile["payout_provider"] as string | null) ?? null,
        number: (profile["payout_number"] as string | null) ?? null,
        name: (profile["payout_name"] as string | null) ?? null,
      },
      total_sent: Number(sentRes.count ?? 0),
      reward_total: rewardTotal,
      devices,
      campaigns,
      migrated,
    };
  });

/**
 * Test Blast: perangkat worker mengirim SATU pesan ke nomor pantau yang diisi admin.
 * Tidak menyentuh message_queue maupun reward_ledger — hanya dicatat di monitor_log
 * dengan alasan "test_blast", jadi tidak masuk laporan kampanye dan tidak dibayar.
 * Blast ke sisa nomor target kampanye tetap berjalan seperti biasa.
 */
export const adminTestBlast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; phone: string; campaignId?: string | null }) => {
    const sessionId = String(input?.sessionId ?? "").trim();
    if (!sessionId) throw new Error("Perangkat worker tidak dikenali.");
    const phone = digits(input?.phone);
    if (phone.length < 8 || phone.length > 18) {
      throw new Error("Nomor pantau tidak valid. Tulis nomor lengkap dengan kode negara, contoh 6281234567890.");
    }
    const campaignId = String(input?.campaignId ?? "").trim();
    return { sessionId, phone, campaignId: campaignId || null };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; phone: string }> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: session } = await admin
      .from("wa_sessions")
      .select("id,user_id,phone_number,status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Perangkat worker tidak ditemukan.");

    let text = "🔎 TEST BLAST\nPesan uji dari admin. Tidak dihitung sebagai pengiriman kampanye.";
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaFilename: string | null = null;
    let footerText: string | null = null;
    let buttons: unknown = null;

    if (data.campaignId) {
      const { data: campaign } = await admin
        .from("campaigns")
        .select("message_body,media_url,media_type,media_filename,footer_text,buttons_json")
        .eq("id", data.campaignId)
        .maybeSingle();
      const body = (campaign?.message_body as string | null)?.trim();
      if (body) {
        const { buildMessageBody } = await import("@/lib/whatsapp");
        text = buildMessageBody(body, { phone: data.phone, name: data.phone });
      }
      mediaUrl = (campaign?.media_url as string | null)?.trim() || null;
      mediaType = mediaUrl && (!campaign?.media_type || campaign.media_type === "text")
        ? "image"
        : ((campaign?.media_type as string | null) ?? "text");
      mediaFilename = (campaign?.media_filename as string | null) ?? null;
      footerText = (campaign?.footer_text as string | null) ?? null;
      buttons = campaign?.buttons_json ?? null;
    }

    const { sendMessage } = await import("@/lib/wa-gateway.server");
    let status = "sent";
    let errorLog: string | null = null;
    try {
      await sendMessage({
        sessionId: data.sessionId,
        to: data.phone,
        text,
        mediaUrl,
        mediaType: mediaType as never,
        mediaFilename,
        footerText,
        buttons: buttons as never,
      });
    } catch (err) {
      status = "failed";
      errorLog = err instanceof Error ? err.message : "Test blast gagal";
    }

    await admin.from("monitor_log").insert({
      monitor_phone: data.phone,
      sender_phone: session.phone_number ?? null,
      session_id: data.sessionId,
      owner_id: session.user_id ?? null,
      recipient_phone: data.phone,
      campaign_id: data.campaignId,
      reason: "test_blast",
      status,
      error_log: errorLog,
    });

    if (status === "failed") throw new Error(errorLog ?? "Test blast gagal");

    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      "worker_test_blast",
      `Test blast ke nomor pantau ${data.phone} lewat perangkat ${session.phone_number ?? data.sessionId}`,
    );
    return { ok: true, phone: data.phone };
  });

/** Pause / lanjutkan perangkat worker. Perangkat berhenti mengambil nomor baru saat dipause. */
export const setWorkerBlastEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; enabled: boolean }) => {
    const sessionId = String(input?.sessionId ?? "").trim();
    if (!sessionId) throw new Error("Perangkat worker tidak dikenali.");
    return { sessionId, enabled: Boolean(input?.enabled) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; enabled: boolean }> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: saved, error } = await admin
      .from("wa_sessions")
      .update({ blast_ready: data.enabled, updated_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .select("id,phone_number")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Perangkat worker tidak ditemukan.");
    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      data.enabled ? "worker_resume" : "worker_pause",
      `${data.enabled ? "Melanjutkan" : "Menjeda"} blast perangkat ${saved.phone_number ?? data.sessionId}`,
    );
    return { ok: true, enabled: data.enabled };
  });

/**
 * Kick / buka blokir worker pada satu kampanye berjalan. Saat diblokir, semua nomor yang
 * masih dia pegang di kampanye itu dilepas kembali ke kolam supaya worker lain mengerjakan.
 */
export const setWorkerCampaignBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workerId: string; campaignId: string; blocked: boolean }) => {
    const workerId = String(input?.workerId ?? "").trim();
    const campaignId = String(input?.campaignId ?? "").trim();
    if (!workerId || !campaignId) throw new Error("Worker atau kampanye tidak dikenali.");
    return { workerId, campaignId, blocked: Boolean(input?.blocked) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; blocked: boolean; released: number }> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    if (!data.blocked) {
      const { error } = await admin
        .from("campaign_worker_blocks")
        .delete()
        .eq("campaign_id", data.campaignId)
        .eq("user_id", data.workerId);
      if (error) throw new Error(migrationHint(error.message));
      await (await import("@/lib/activity-log.server")).logActivity(
        context.userId,
        "worker_campaign_unblock",
        `Worker dikembalikan ke kampanye (${data.campaignId})`,
      );
      return { ok: true, blocked: false, released: 0 };
    }

    const { error } = await admin.from("campaign_worker_blocks").upsert(
      {
        campaign_id: data.campaignId,
        user_id: data.workerId,
        blocked_by: context.userId,
        reason: "Dikeluarkan admin dari Monitor Blast",
      },
      { onConflict: "campaign_id,user_id" },
    );
    if (error) throw new Error(migrationHint(error.message));

    // Lepas sisa nomor yang dia pegang supaya worker lain bisa melanjutkan.
    const { data: released, error: releaseError } = await admin
      .from("message_queue")
      .update({
        status: "pending",
        claimed_by: null,
        claimed_at: null,
        session_id: null,
        attempt_id: null,
        locked_at: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq("campaign_id", data.campaignId)
      .in("status", ["pending", "processing"])
      .or(`user_id.eq.${data.workerId},claimed_by.eq.${data.workerId}`)
      .select("id");
    if (releaseError) throw new Error(releaseError.message);

    const count = ((released ?? []) as unknown[]).length;
    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      "worker_campaign_kick",
      `Worker dikeluarkan dari kampanye (${data.campaignId}); ${count} nomor dilepas ke kolam`,
    );
    return { ok: true, blocked: true, released: count };
  });

function migrationHint(message: string): string {
  if (/does not exist|schema cache/i.test(message)) {
    return "Migrasi 032 belum dijalankan di database. Jalankan SQL 032 dulu.";
  }
  return message;
}
