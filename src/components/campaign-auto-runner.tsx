import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/my-client";
import { blastTick, dispatchCampaign } from "@/lib/api-client";

/**
 * Pekerja kampanye global.
 *
 * Setiap perangkat yang sudah ditekan Start punya alur pengiriman sendiri yang
 * berjalan TERUS-MENERUS tanpa jeda tambahan: begitu satu putaran selesai,
 * putaran berikutnya langsung dimulai. Pengiriman hanya berhenti bila worker
 * menekan Stop pada perangkat itu, data habis, atau kampanye dihentikan admin.
 *
 * Perangkat yang sedang terputus tidak dimatikan — sambungan dicoba ulang
 * otomatis dan pengiriman lanjut sendiri setelah tersambung.
 *
 * Hanya satu tab yang boleh menjalankan pekerja ini (navigator.locks), dan
 * hanya satu alur per perangkat, supaya sambungan WhatsApp tidak dipakai ganda.
 */
export function CampaignAutoRunner() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let stopped = false;
    const deviceLoops = new Set<string>();

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["member-blast-state"] });
    };

    // Alur pengiriman satu perangkat: berputar terus selama saklar "siap blast"
    // pada perangkat itu masih menyala.
    const runDevice = async (deviceId: string) => {
      if (deviceLoops.has(deviceId)) return;
      deviceLoops.add(deviceId);
      try {
        while (!stopped) {
          try {
            await blastTick(deviceId);
          } catch {
            /* gangguan sementara: langsung dicoba lagi */
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          refresh();

          const { data: row } = await supabase
            .from("wa_sessions")
            .select("blast_ready")
            .eq("id", deviceId)
            .maybeSingle();
          if (!row || !(row as { blast_ready?: boolean | null }).blast_ready) break;
        }
      } finally {
        deviceLoops.delete(deviceId);
      }
    };

    // Pengawas: mencari kampanye berjalan dan perangkat aktif, lalu memastikan
    // setiap perangkat aktif punya alur pengiriman yang hidup.
    const supervise = async () => {
      while (!stopped) {
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session.session) {
            const { data: campaigns } = await supabase
              .from("campaigns")
              .select("id,session_id,status")
              .eq("status", "running")
              .limit(20);

            // Kampanye yang terikat satu perangkat tertentu tetap didorong.
            for (const campaign of (campaigns ?? []) as unknown as Array<{
              id: string;
              session_id: string | null;
            }>) {
              if (stopped) return;
              if (!campaign.session_id || deviceLoops.has(campaign.session_id)) continue;
              try {
                await dispatchCampaign({ campaign_id: campaign.id, action: "process" });
              } catch {
                /* gangguan sementara */
              }
            }

            const { data: devices } = await supabase
              .from("wa_sessions")
              .select("id,blast_ready");

            for (const device of (devices ?? []) as unknown as Array<{
              id: string;
              blast_ready: boolean | null;
            }>) {
              if (device.blast_ready) void runDevice(device.id);
            }
          }
        } catch {
          /* gangguan sementara */
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };

    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      navigator.locks
        .request("aawb-campaign-auto-worker", { ifAvailable: true }, async (lock) => {
          if (!lock) return;
          await supervise();
        })
        .catch(() => undefined);
    } else {
      void supervise();
    }

    return () => {
      stopped = true;
    };
  }, [queryClient]);

  return null;
}
