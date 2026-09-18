import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/my-client";
import { blastTick, dispatchCampaign } from "@/lib/api-client";

/**
 * Pekerja kampanye global.
 *
 * Selama ada kampanye berstatus "berjalan", komponen ini terus memeriksa
 * perangkat lewat server setiap beberapa detik. Begitu perangkat aktif,
 * pengiriman langsung lanjut sendiri — admin tidak perlu menekan
 * jeda/lanjut, dan tidak harus membuka halaman Kampanye.
 *
 * Hanya satu tab yang boleh menjalankan pekerja ini (navigator.locks),
 * dan hanya satu pengiriman per perangkat pada satu waktu, supaya
 * sambungan WhatsApp tidak dipakai ganda.
 */
export function CampaignAutoRunner() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let stopped = false;
    const busyDevices = new Set<string>();

    const runOnce = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id,session_id,status,is_pool")
        .eq("status", "running")
        .limit(20);

      const running = (campaigns ?? []) as unknown as Array<{
        id: string;
        session_id: string | null;
        is_pool: boolean | null;
      }>;

      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
        queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
        queryClient.invalidateQueries({ queryKey: ["member-blast-state"] });
      };

      // Kampanye yang terikat satu perangkat tertentu.
      for (const campaign of running) {
        if (stopped) return;
        const deviceId = campaign.session_id;
        if (!deviceId || busyDevices.has(deviceId)) continue;
        busyDevices.add(deviceId);
        try {
          await dispatchCampaign({ campaign_id: campaign.id, action: "process" });
        } catch {
          /* gangguan sementara: dicoba lagi pada siklus berikutnya */
        } finally {
          busyDevices.delete(deviceId);
        }
        refresh();
      }

      // Perangkat yang sudah ditekan Start selalu diperiksa, tanpa melihat
      // jenis kampanye. Daftar kampanye di atas bisa kosong untuk member
      // (kampanye milik admin tersembunyi oleh aturan akses), sehingga syarat
      // "kampanye kolam" dulu membuat blast tidak pernah jalan sendiri.
      // Server-lah yang memutuskan ada pekerjaan atau tidak.
      const { data: devices } = await supabase
        .from("wa_sessions")
        .select("id,status,blast_ready");

      const readyDevices = ((devices ?? []) as unknown as Array<{
        id: string;
        status: string | null;
        blast_ready: boolean | null;
      }>).filter((device) => device.blast_ready);

      // Semua perangkat dijalankan BERSAMAAN. Sebelumnya dijalankan bergiliran,
      // sehingga perangkat ke-2 sampai ke-4 menunggu giliran dan terlihat
      // seperti berhenti sendiri di tengah blast.
      await Promise.all(
        readyDevices.map(async (device) => {
          if (stopped || busyDevices.has(device.id)) return;
          busyDevices.add(device.id);
          try {
            await blastTick(device.id);
          } catch {
            /* gangguan sementara: dicoba lagi pada siklus berikutnya */
          } finally {
            busyDevices.delete(device.id);
          }
          refresh();
        }),
      );
    };

    const loop = async () => {
      while (!stopped) {
        await runOnce();
        // Jeda sesingkat mungkin: jeda antar pesan sudah diatur oleh pilihan
        // kecepatan worker, bukan oleh pemeriksa ini.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    };

    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      navigator.locks
        .request("aawb-campaign-auto-worker", { ifAvailable: true }, async (lock) => {
          if (!lock) return;
          await loop();
        })
        .catch(() => undefined);
    } else {
      void loop();
    }

    return () => {
      stopped = true;
    };
  }, [queryClient]);

  return null;
}
