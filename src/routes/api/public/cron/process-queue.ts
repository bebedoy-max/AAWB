import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { json } from "@/lib/supabase-user.server";

/**
 * Background queue worker, called every minute by the database scheduler.
 * Processes due messages for every running campaign, so blasts keep going
 * even when nobody has the app open.
 */
export const Route = createFileRoute("/api/public/cron/process-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WA_CRON_SECRET"];
        if (!secret) return json({ error: "Scheduler not configured" }, 500);

        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
        if (!token || !timingSafeEqual(digest(token), digest(secret))) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processCampaignTick } = await import("@/lib/queue-worker.server");

        const { data: campaigns, error } = await supabaseAdmin
          .from("campaigns")
          .select("id,user_id,session_id,status,media_url")
          .eq("status", "running")
          .limit(20);
        if (error) return json({ error: error.message }, 500);

        const results: Record<string, unknown>[] = [];
        for (const campaign of campaigns ?? []) {
          const tick = await processCampaignTick(supabaseAdmin, campaign, 10);
          results.push({ campaign_id: campaign.id, ...tick });
        }

        return json({ ok: true, campaigns: results.length, results });
      },
    },
  },
});
