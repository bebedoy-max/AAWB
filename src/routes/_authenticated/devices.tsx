import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { isGatewayConfigured } from "@/lib/admin.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Power,
  QrCode,
  BatteryMedium,
  Trash2,
  Smartphone,
  KeyRound,
  Copy,
  ShieldCheck,
  ExternalLink,
  Activity,
  Play,
  Square,
  Gauge,
  AlertTriangle,
  Download,
  Pin,
  UserRound,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/my-client";
import {
  confirmPasskey,
  getSessionState,
  requestPairingCode,
  requestPasskeyChallenge,
  requestPasskeyConfirmation,
  sessionAction,
  submitPasskeyAssertion,
} from "@/lib/api-client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/phone-input";
import { BLAST_SPEEDS } from "@/lib/blast-speed";
import { getBlastState, setDeviceBlast } from "@/lib/blast.functions";
import { countryByIso, DEFAULT_COUNTRY_ISO } from "@/lib/countries";
import { formatPhoneDisplay, sanitizePhone } from "@/lib/whatsapp";
import type { SessionGatewayResponse, WaSession } from "@/types/wa";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({
    meta: [
      { title: "Perangkat WhatsApp — AAWB" },
      { name: "description", content: "Kelola perangkat WhatsApp yang terhubung." },
      { property: "og:title", content: "Perangkat WhatsApp — AAWB" },
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
  const [codeSessionId, setCodeSessionId] = useState<string | null>(null);
  const [codeCountry, setCodeCountry] = useState(DEFAULT_COUNTRY_ISO);
  const [codePhone, setCodePhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingRequestedAt, setPairingRequestedAt] = useState<number | null>(null);
  const [pairingBlockedUntil, setPairingBlockedUntil] = useState<number | null>(null);
  const [authStep, setAuthStep] = useState<SessionGatewayResponse["auth_step"]>(null);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

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

  const saveDeviceBlast = useServerFn(setDeviceBlast);
  const [notes, setNotes] = useState<Record<string, string | null>>({});

  const deviceBlast = useMutation({
    mutationFn: (input: { session_id: string; ready?: boolean; speed?: string }) =>
      saveDeviceBlast({ data: input }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
      if (result.ready) toast.success("Perangkat siap menerima perintah blast");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: performance } = useQuery({
    queryKey: ["device-performance"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [sent, failed, pending] = await Promise.all([
        supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("message_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
      ]);
      return { sent: sent.count ?? 0, failed: failed.count ?? 0, pending: pending.count ?? 0 };
    },
  });

  const activeQrSession = sessions?.find((s) => s.id === qrSessionId) ?? null;

  // Poll the gateway while the QR modal is open.
  useEffect(() => {
    const watchedId = qrSessionId ?? codeSessionId;
    if (!watchedId) return;
    const timer = setInterval(async () => {
      try {
        const state = await getSessionState(watchedId);
        setAuthStep(state.auth_step ?? null);
        if (state.auth_step === "confirmation") {
          const result = await requestPasskeyConfirmation(watchedId);
          setConfirmationCode(result.code);
        }
        queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
        if (state.status === "connected") {
          toast.success("Perangkat berhasil dipasangkan");
          setQrSessionId(null);
          setCodeSessionId(null);
          setPairingCode(null);
          setAuthStep(null);
          setConfirmationCode(null);
        } else if (
          pairingCode &&
          pairingRequestedAt &&
          Date.now() - pairingRequestedAt > 120_000 &&
          state.status === "disconnected"
        ) {
          toast.error("Kode pemasangan sudah kedaluwarsa. Tunggu sebentar sebelum meminta kode baru.");
          setPairingCode(null);
          setPairingRequestedAt(null);
          setAuthStep(null);
          setConfirmationCode(null);
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [qrSessionId, codeSessionId, pairingCode, pairingRequestedAt, queryClient]);

  const checkGateway = useServerFn(isGatewayConfigured);
  const { data: gateway } = useQuery({
    queryKey: ["gateway-configured"],
    queryFn: () => checkGateway(),
  });

  const MAX_DEVICES = 4;

  const loadBlastState = useServerFn(getBlastState);
  const { data: blastState } = useQuery({
    queryKey: ["member-blast-state"],
    refetchInterval: 10_000,
    queryFn: () => loadBlastState(),
  });
  const poolAvailable = blastState?.pool_available ?? 0;

  const copyProfileName = async () => {
    const { data } = await supabase.auth.getUser();
    const metadata = data.user?.user_metadata as { organization_name?: string; username?: string } | undefined;
    await navigator.clipboard.writeText(metadata?.organization_name ?? metadata?.username ?? "Member");
    toast.success("Nama profil disalin");
  };

  const createSession = useMutation({
    mutationFn: async () => {
      if ((sessions?.length ?? 0) >= MAX_DEVICES) {
        throw new Error(`Maksimal ${MAX_DEVICES} perangkat per akun.`);
      }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sesi pengguna tidak ditemukan.");
      const { data, error } = await supabase
        .from("wa_sessions")

        .insert({
          user_id: user.user.id,
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

  useEffect(() => {
    if (!pairingBlockedUntil) return;
    const remaining = pairingBlockedUntil - Date.now();
    if (remaining <= 0) {
      setPairingBlockedUntil(null);
      return;
    }
    const timer = window.setTimeout(() => setPairingBlockedUntil(null), remaining);
    return () => window.clearTimeout(timer);
  }, [pairingBlockedUntil]);

  const startPairing = useMutation({
    mutationFn: (id: string) => sessionAction(id, "start"),
    onSuccess: (state) => {
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
      setQrSessionId(state.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pairWithCode = useMutation({
    mutationFn: async () => {
      if (!codeSessionId) throw new Error("Perangkat belum dipilih");
      const phone = sanitizePhone(codePhone, countryByIso(codeCountry).dial);
      if (phone.length < 8) throw new Error("Masukkan nomor WhatsApp yang valid");
      return requestPairingCode(codeSessionId, phone);
    },
    onSuccess: (res) => {
      setPairingCode(res.code);
      setPairingRequestedAt(Date.now());
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
    },
    onError: (e: Error & { status?: number }) => {
      if (e.status === 429) {
        setPairingBlockedUntil(Date.now() + 60 * 60 * 1000);
      }
      toast.error(e.message);
    },
  });

  const openCodeDialog = (sessionId: string, phone: string | null) => {
    setCodeSessionId(sessionId);
    setPairingCode(null);
    setPairingRequestedAt(null);
    setAuthStep(null);
    setConfirmationCode(null);
    setCodePhone(phone ?? "");
    setCodeCountry(DEFAULT_COUNTRY_ISO);
  };

  const finishPasskey = useMutation({
    mutationFn: async () => {
      if (!codeSessionId) throw new Error("Perangkat belum dipilih");
      const { challenge } = await requestPasskeyChallenge(codeSessionId);
      const chromeApi = (window as unknown as {
        chrome?: { runtime?: { sendMessage?: (...args: unknown[]) => void; lastError?: { message?: string } } };
      }).chrome;
      if (!chromeApi?.runtime?.sendMessage) {
        throw new Error("Pasang ekstensi WhatsApp Browser Extension, lalu muat ulang halaman ini.");
      }
      const assertion = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Verifikasi passkey melewati batas waktu.")), 180_000);
        chromeApi.runtime?.sendMessage?.(
          "ghpdcgnjffaaekflfpcgkgpbafmjldcp",
          { type: "waha-passkey-sign", challenge },
          (response: unknown) => {
            window.clearTimeout(timer);
            const result = response as { ok?: boolean; assertion?: Record<string, unknown>; error?: string } | undefined;
            if (!result?.ok || !result.assertion) reject(new Error(result?.error || "Verifikasi passkey gagal."));
            else resolve(result.assertion);
          },
        );
      });
      await submitPasskeyAssertion(codeSessionId, assertion);
    },
    onSuccess: () => toast.success("Passkey terverifikasi, menyelesaikan koneksi…"),
    onError: (e: Error) => toast.error(e.message),
  });

  const approveConfirmation = useMutation({
    mutationFn: async () => {
      if (!codeSessionId) throw new Error("Perangkat belum dipilih");
      return confirmPasskey(codeSessionId);
    },
    onSuccess: () => toast.success("Konfirmasi diterima, menyelesaikan koneksi…"),
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
        title="Pengirim WhatsApp"
        description="Kelola perangkat WhatsApp Anda untuk pengiriman pesan."
      />

      <section className="mb-6 rounded-2xl border border-warning-border bg-warning-surface p-5 shadow-panel sm:hidden">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-warning-foreground">PERHATIAN: ATUR PROFIL</h2>
            <p className="mt-2 text-sm leading-6 text-warning-foreground">Gunakan nama dan foto profil yang ditentukan sebelum mulai mengirim pesan.</p>
            <div className="mt-4 rounded-xl border border-warning-border bg-background/25 p-3 text-xs font-semibold leading-5 text-warning-foreground"><Pin className="mr-2 inline size-3.5 text-warning" />Jika mengerjakan data, simpan bukti aktivitas sesuai arahan admin.</div>
            <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-warning/70 bg-member-panel"><UserRound className="size-5 text-foreground/70" /></div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" asChild><a href="/aawb-wordmark.png" download="foto-profil-aawb.png"><Download className="mr-1 size-4" /> Unduh Foto</a></Button>
                <Button size="sm" variant="outline" onClick={() => void copyProfileName()}>Salin Nama</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {gateway && !gateway.configured && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p>
              Gateway WhatsApp belum diatur, sehingga perangkat tidak bisa dipasangkan. Isi alamat
              gateway terlebih dahulu.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">Buka pengaturan Admin</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8 rounded-2xl shadow-panel">
        <CardContent className="grid items-center gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><Database className="size-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Data yang tersisa saat ini</p>
              <p className="mt-1 text-2xl font-semibold">{(poolAvailable ?? 0).toLocaleString("id-ID")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Sisa kontak dari kampanye yang sedang berjalan</p>
            </div>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => setAddOpen(true)} disabled={(sessions?.length ?? 0) >= MAX_DEVICES}><Plus className="mr-1 size-5" /> Tambah perangkat <span className="ml-2 rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs">{sessions?.length ?? 0} / {MAX_DEVICES}</span></Button>
        </CardContent>
      </Card>

      <div className="mb-5 flex items-center gap-2"><Activity className="size-6 text-primary" /><h2 className="text-xl font-semibold">Ringkasan Performa Blast</h2></div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Slot Aktif", (sessions ?? []).filter((session) => session.status === "connected").length, "text-primary"],
          ["Sukses (Semua)", performance?.sent ?? 0, "text-success"],
          ["Gagal (Semua)", performance?.failed ?? 0, "text-destructive"],
          ["Partisipasi Blast", performance?.pending ?? 0, "text-primary"],
          ["Nomor Tertaut", (sessions ?? []).filter((session) => Boolean(session.phone_number)).length, "text-accent-foreground"],
          ["Rata-rata Speed", 0, "text-warning-foreground"],
        ].map(([label, value, tone]) => <Card key={String(label)} className="rounded-2xl shadow-none"><CardContent className="min-h-28 p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={cn("mt-3 text-2xl font-semibold", String(tone))}>{value}</p></CardContent></Card>)}
      </div>

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

              <div className="mt-4 space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Gauge className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Kecepatan blast</span>
                </div>
                <Select
                  value={session.blast_speed ?? "santai"}
                  onValueChange={(value) =>
                    deviceBlast.mutate({ session_id: session.id, speed: value })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pilih kecepatan" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLAST_SPEEDS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {session.blast_ready ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => deviceBlast.mutate({ session_id: session.id, ready: false })}
                    disabled={deviceBlast.isPending}
                  >
                    <Square className="mr-1 size-3.5" /> Stop blast (siap menerima)
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (session.status !== "connected") {
                        toast.error("Hubungkan perangkat ini terlebih dahulu.");
                        return;
                      }
                      deviceBlast.mutate({ session_id: session.id, ready: true });
                    }}
                    disabled={deviceBlast.isPending}
                  >
                    <Play className="mr-1 size-3.5" /> Start blast
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  {session.blast_ready
                    ? "Siap menerima perintah blast dari admin."
                    : "Status idle — tekan Start blast agar perangkat siap."}
                </p>
                {notes[session.id] ? (
                  <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    {notes[session.id]}
                  </p>
                ) : null}
              </div>

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
                {session.status !== "connected" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCodeDialog(session.id, session.phone_number)}
                  >
                    <KeyRound className="mr-1 size-3.5" /> Pasangkan via kode
                  </Button>
                ) : null}
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
          <Card className="rounded-xl border-dashed shadow-none sm:col-span-2 xl:col-span-3">
            <CardContent className="flex min-h-56 flex-col items-center justify-center p-10 text-center"><div className="grid size-14 place-items-center rounded-full bg-secondary"><Smartphone className="size-6 text-primary" /></div><p className="mt-4 font-semibold">Belum ada perangkat</p><p className="mt-1 text-sm text-muted-foreground">Tambahkan WhatsApp untuk mulai mengirim pesan.</p><Button className="mt-5" onClick={() => setAddOpen(true)}><Plus className="mr-1 size-4" /> Tambah perangkat</Button></CardContent>
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

      <Dialog
        open={!!codeSessionId}
        onOpenChange={(o) => {
          if (!o) {
            setCodeSessionId(null);
            setPairingCode(null);
            setPairingRequestedAt(null);
            setAuthStep(null);
            setConfirmationCode(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pasangkan dengan kode</DialogTitle>
            <DialogDescription>
              Masukkan nomor WhatsApp perangkat ini, lalu buka WhatsApp → Perangkat tertaut →
              Tautkan dengan nomor telepon dan ketik kode yang muncul.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Nomor WhatsApp</Label>
            <PhoneInput
              country={codeCountry}
              onCountryChange={setCodeCountry}
              value={codePhone}
              onChange={setCodePhone}
            />
          </div>

          {pairingCode ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">Kode pemasangan</p>
              <p className="font-mono text-2xl font-semibold tracking-[0.3em]">{pairingCode}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(pairingCode);
                  toast.success("Kode disalin");
                }}
              >
                <Copy className="mr-1 size-3.5" /> Salin kode
              </Button>
              <p className="text-xs text-muted-foreground">
                Masukkan kode segera. Jangan meminta kode baru selama kode ini masih berlaku.
              </p>
            </div>
          ) : null}

          {pairingBlockedUntil && pairingBlockedUntil > Date.now() ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              WhatsApp sedang membatasi kode. Coba lagi setelah pukul{" "}
              {new Date(pairingBlockedUntil).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              , atau gunakan QR.
            </p>
          ) : null}

          {authStep === "passkey" ? (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Verifikasi passkey diperlukan</p>
                  <p className="text-xs text-muted-foreground">WhatsApp meminta konfirmasi keamanan tambahan untuk menyelesaikan koneksi.</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => finishPasskey.mutate()} disabled={finishPasskey.isPending}>
                <ShieldCheck className="mr-1 size-4" /> Lanjutkan verifikasi
              </Button>
              <Button asChild variant="outline" className="w-full">
                <a href="https://chromewebstore.google.com/detail/ghpdcgnjffaaekflfpcgkgpbafmjldcp" target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 size-4" /> Pasang ekstensi verifikasi
                </a>
              </Button>
            </div>
          ) : null}

          {authStep === "confirmation" && confirmationCode ? (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-xs text-muted-foreground">Pastikan kode ini sama dengan yang tampil di WhatsApp</p>
              <p className="font-mono text-3xl font-semibold">{confirmationCode}</p>
              <Button onClick={() => approveConfirmation.mutate()} disabled={approveConfirmation.isPending}>
                Kode sama, konfirmasi
              </Button>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => pairWithCode.mutate()}
              disabled={
                pairWithCode.isPending ||
                Boolean(pairingCode) ||
                Boolean(pairingBlockedUntil && pairingBlockedUntil > Date.now())
              }
            >
              {pairingCode ? "Menunggu pemasangan" : "Minta kode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
