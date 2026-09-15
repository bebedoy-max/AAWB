import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Power, QrCode, BatteryMedium, Trash2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/my-client";
import { getSessionState, sessionAction } from "@/lib/api-client";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPhoneDisplay } from "@/lib/whatsapp";
import type { WaSession } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({
    meta: [
      { title: "Perangkat WhatsApp — WBlast" },
      { name: "description", content: "Kelola perangkat WhatsApp yang terhubung." },
      { property: "og:title", content: "Perangkat WhatsApp — WBlast" },
      { property: "og:description", content: "Kelola perangkat WhatsApp yang terhubung." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Devices,
});

function QrView({ value }: { value: string }) {
  // Gateways may return either the raw QR payload or a ready data:image PNG.
  if (value.startsWith("data:image")) {
    return (
      <div className="flex justify-center rounded-lg bg-white p-4">
        <img src={value} alt="QR code untuk memasangkan WhatsApp" className="size-56" />
      </div>
    );
  }
  return (
    <div className="flex justify-center rounded-lg bg-white p-4">
      <QRCodeSVG value={value} size={224} level="M" />
    </div>
  );
}

function Devices() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);

  const { data: sessions } = useQuery({
    queryKey: ["wa-sessions"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_sessions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WaSession[];
    },
  });

  const activeQrSession = sessions?.find((s) => s.id === qrSessionId) ?? null;

  // Poll the gateway while the QR modal is open.
  useEffect(() => {
    if (!qrSessionId) return;
    const timer = setInterval(async () => {
      try {
        const state = await getSessionState(qrSessionId);
        queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
        if (state.status === "connected") {
          toast.success("Perangkat berhasil dipasangkan");
          setQrSessionId(null);
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [qrSessionId, queryClient]);

  const createSession = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("wa_sessions")
        .insert({
          user_id: user.user!.id,
          session_name: name.trim() || "Perangkat baru",
          status: "disconnected",
        })
        .select()
        .single();
      if (error) throw error;
      return data as WaSession;
    },
    onSuccess: (session) => {
      setAddOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
      startPairing.mutate(session.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startPairing = useMutation({
    mutationFn: (id: string) => sessionAction(id, "start"),
    onSuccess: (state) => {
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
      setQrSessionId(state.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => sessionAction(id, "disconnect"),
    onSuccess: () => {
      toast.success("Perangkat terputus");
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wa_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perangkat dihapus");
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
    },
  });

  return (
    <>
      <PageHeader
        title="Perangkat"
        description="Kelola perangkat WhatsApp yang terhubung melalui gateway."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 size-4" /> Tambah perangkat
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(sessions ?? []).map((session) => (
          <Card key={session.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Smartphone className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium">{session.session_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.phone_number ? formatPhoneDisplay(session.phone_number) : "Belum dipasangkan"}
                    </p>
                  </div>
                </div>
                <StatusBadge status={session.status} />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <BatteryMedium className="size-3.5" />
                  {session.battery_level != null ? `${session.battery_level}%` : "—"}
                </div>
                <div className="text-right">
                  {session.last_ping
                    ? `Terakhir aktif ${new Date(session.last_ping).toLocaleTimeString("id-ID")}`
                    : "Belum ada aktivitas"}
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {session.status === "connected" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnect.mutate(session.id)}
                  >
                    <Power className="mr-1 size-3.5" /> Putuskan
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => startPairing.mutate(session.id)}>
                    <QrCode className="mr-1 size-3.5" /> Pasangkan via QR
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startPairing.mutate(session.id)}
                >
                  <RefreshCw className="mr-1 size-3.5" /> Hubungkan ulang
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => remove.mutate(session.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {sessions?.length === 0 ? (
          <Card className="sm:col-span-2 xl:col-span-3">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Belum ada perangkat — tambahkan perangkat untuk mulai memasangkan nomor WhatsApp.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah perangkat WhatsApp</DialogTitle>
            <DialogDescription>
              Beri nama perangkat, lalu pindai kode QR dengan WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="device-name">Nama perangkat</Label>
            <Input
              id="device-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nomor penjualan 1"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
              Buat &amp; pasangkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrSessionId} onOpenChange={(o) => !o && setQrSessionId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pindai untuk memasangkan</DialogTitle>
            <DialogDescription>
              WhatsApp → Perangkat tertaut → Tautkan perangkat. Status diperbarui otomatis.
            </DialogDescription>
          </DialogHeader>
          {activeQrSession?.qr_string ? (
            <QrView value={activeQrSession.qr_string} />
          ) : (
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Menunggu kode QR dari gateway…
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Status</span>
            <StatusBadge status={activeQrSession?.status ?? "connecting"} />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => activeQrSession && startPairing.mutate(activeQrSession.id)}
            >
              <RefreshCw className="mr-1 size-3.5" /> Perbarui QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
