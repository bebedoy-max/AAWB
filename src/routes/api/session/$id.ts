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

        const { sessionStatus, gatewayLiveSessions, GatewayError } = await import("@/lib/wa-gateway.server");
        try {
          const state = await sessionStatus(params.id);
          // Restriction metadata is provided by the gateway's session list, not
          // inferred from a disconnected status or a failed message send.
          const live = await gatewayLiveSessions(10_000).then((items) => items.get(params.id)).catch(() => undefined);
          const liveStatus = live?.rawStatus === "STOPPED" && (live.restrictReason || live.restrictedUntil) ? "disconnected" : state.status;
          const now = new Date().toISOString();
          const patch = {
            status: liveStatus,
            // The gateway only emits the QR once (on start), so keep the stored
            // one while pairing is still pending.
            qr_string: state.status === "connected" ? null : (state.qr ?? row.qr_string),
            phone_number: state.phone ?? row.phone_number,
            battery_level: state.battery,
            last_ping: state.status === "connected" ? now : row.last_ping,
            updated_at: now,
          };
          await supabase.from("wa_sessions").update(patch).eq("id", params.id);
          // CATATAN: perangkat yang baru tersambung SENGAJA tidak dinyalakan otomatis.
          // Blast hanya berjalan setelah worker menekan tombol Start sendiri. Dulu di sini ada
          // blok yang menyalakan blast_ready begitu status menjadi "connected", sehingga pairing
          // langsung memulai pengiriman tanpa persetujuan worker. Kolom blast_ready bawaannya
          // false (migrasi 011), jadi cukup dengan tidak menyentuhnya di sini.
          return json({ id: params.id, auth_step: state.authStep, ...patch,
            raw_status: live?.rawStatus ?? null,
            restricted_until: live?.restrictedUntil ?? null,
            restrict_reason: live?.restrictReason ?? null,
          } satisfies SessionGatewayResponse & {
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
          assertion?: Record<string, unknown>;
        };
        const action = body.action ?? "start";

        const {
          startSession,
          logoutSession,
          requestPairingCode,
          getPasskeyChallenge,
          submitPasskeyAssertion,
          getPasskeyConfirmation,
          confirmPasskey,
          GatewayError,
        } = await import("@/lib/wa-gateway.server");
        const now = new Date().toISOString();

        try {
          if (action === "passkey-challenge") {
            return json({ challenge: await getPasskeyChallenge(params.id) });
          }
          if (action === "passkey-submit") {
            if (!body.assertion) return json({ error: "Hasil verifikasi passkey tidak tersedia" }, 400);
            await submitPasskeyAssertion(params.id, body.assertion);
            return json({ ok: true });
          }
          if (action === "passkey-confirmation") {
            return json({ code: await getPasskeyConfirmation(params.id) });
          }
          if (action === "passkey-confirm") {
            await confirmPasskey(params.id);
            return json({ ok: true });
          }

          if (action === "pair-code") {
            const phone = (body.phone ?? "").replace(/\D/g, "");
            if (!phone) return json({ error: "Nomor telepon wajib diisi" }, 400);
            const code = await requestPairingCode(params.id, phone);
            const { error: updateError } = await supabase
              .from("wa_sessions")
              .update({
                status: "connecting",
                phone_number: phone,
                qr_string: null,
                updated_at: now,
              })
              .eq("id", params.id);
            if (updateError) return json({ error: updateError.message }, 400);
            return json({ id: params.id, code, phone_number: phone });
          }

          if (action === "delete") {
            // Sesi gateway dihapus DULU, baru baris database. Kalau urutannya dibalik dan
            // penghapusan gateway gagal, sesi menjadi yatim: tidak ada lagi baris yang
            // menunjuk ke sana, sehingga tidak pernah bisa ditemukan dan dibersihkan lagi.
            const { deleteGatewaySession } = await import("@/lib/wa-gateway.server");
            await deleteGatewaySession(params.id);
            const { error: deleteError } = await supabase
              .from("wa_sessions")
              .delete()
              .eq("id", params.id);
            if (deleteError) return json({ error: deleteError.message }, 400);
            return json({ id: params.id, deleted: true });
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
