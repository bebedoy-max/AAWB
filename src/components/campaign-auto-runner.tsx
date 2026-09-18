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
      if (!running.length) return;

      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
        queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
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

      // Kampanye kolam: periksa semua perangkat. Tick server memverifikasi
      // status gateway nyata dan menyelaraskan status DB, sehingga perangkat
      // yang baru tersambung langsung bekerja dan status lama tidak dianggap aktif.
      const hasPool = running.some((c) => c.is_pool && !c.session_id);
      if (!hasPool) return;

      const { data: devices } = await supabase
        .from("wa_sessions")
        .select("id,status");

      for (const device of (devices ?? []) as Array<{ id: string }>) {
        if (stopped) return;
        if (busyDevices.has(device.id)) continue;
        busyDevices.add(device.id);
        try {
          await blastTick(device.id);
        } catch {
          /* gangguan sementara: dicoba lagi pada siklus berikutnya */
        } finally {
          busyDevices.delete(device.id);
        }
        refresh();
      }
    };

    const loop = async () => {
      while (!stopped) {
        await runOnce();
        await new Promise((resolve) => setTimeout(resolve, 4_000));
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
