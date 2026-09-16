import { createFileRoute } from "@tanstack/react-router";
import { json, unauthorized, userClientFromRequest } from "@/lib/supabase-user.server";
import type { SessionGatewayResponse } from "@/types/wa";

/**
 * Bridge between the app and the user's real Baileys gateway.
 * Every call hits the gateway and mirrors the result into wa_sessions.
 */
export const Route = createFileRoute("/api/session/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const supabase = userClientFromRequest(request);
        if (!supabase) return unauthorized();

        const { data: row, error } = await supabase
          .from("wa_sessions")
          .select("id,status,qr_string,phone_number,battery_level,last_ping")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!row) return json({ error: "Session not found" }, 404);

        const { sessionStatus, GatewayError } = await import("@/lib/wa-gateway.server");
        try {
          const state = await sessionStatus(params.id);
          const now = new Date().toISOString();
          const patch = {
            status: state.status,
            // The gateway only emits the QR once (on start), so keep the stored
            // one while pairing is still pending.
            qr_string: state.status === "connected" ? null : (state.qr ?? row.qr_string),
            phone_number: state.phone ?? row.phone_number,
            battery_level: state.battery,
            last_ping: state.status === "connected" ? now : row.last_ping,
            updated_at: now,
          };
          await supabase.from("wa_sessions").update(patch).eq("id", params.id);
          return json({ id: params.id, ...patch } satisfies SessionGatewayResponse & {
            updated_at: string;
          });
        } catch (err) {
          const gwErr = err as InstanceType<typeof GatewayError>;
          return json(
            { ...row, id: params.id, error: gwErr.message },
            gwErr.status === 404 ? 200 : (gwErr.status ?? 502),
          );
        }
      },

      POST: async ({ request, params }) => {
        const supabase = userClientFromRequest(request);
        if (!supabase) return unauthorized();

        const { data: row, error } = await supabase
          .from("wa_sessions")
          .select("id")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!row) return json({ error: "Session not found" }, 404);

        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          phone?: string;
        };
        const action = body.action ?? "start";

        const { startSession, logoutSession, requestPairingCode, GatewayError } = await import(
          "@/lib/wa-gateway.server"
        );
        const now = new Date().toISOString();

        try {
          if (action === "pair-code") {
            const phone = (body.phone ?? "").replace(/\D/g, "");
            if (!phone) return json({ error: "Nomor telepon wajib diisi" }, 400);
            const code = await requestPairingCode(params.id, phone);
            await supabase
              .from("wa_sessions")
              .update({ status: "connecting", updated_at: now })
              .eq("id", params.id);
            return json({ id: params.id, code, phone_number: phone });
          }

          if (action === "disconnect") {
            await logoutSession(params.id);
            const patch = {
              status: "disconnected" as const,
              qr_string: null,
              battery_level: null,
              updated_at: now,
            };
            await supabase.from("wa_sessions").update(patch).eq("id", params.id);
            return json({ id: params.id, ...patch, phone_number: null, last_ping: null });
          }

          const state = await startSession(params.id);
          const patch = {
            status: state.status,
            qr_string: state.qr,
            phone_number: state.phone,
            battery_level: state.battery,
            last_ping: now,
            updated_at: now,
          };
          await supabase.from("wa_sessions").update(patch).eq("id", params.id);
          return json({ id: params.id, ...patch });
        } catch (err) {
          const gwErr = err as InstanceType<typeof GatewayError>;
          return json({ error: gwErr.message }, gwErr.status ?? 502);
        }
      },
    },
  },
});
