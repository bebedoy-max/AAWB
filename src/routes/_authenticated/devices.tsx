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
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Clock3,
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
  deleteSession,
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
import { WaProfilePanel } from "@/components/wa-profile-panel";
import { PhoneInput } from "@/components/phone-input";
import { BLAST_SPEEDS } from "@/lib/blast-speed";
import { getBlastState, setDeviceBlast } from "@/lib/blast.functions";
import { countryByIso, DEFAULT_COUNTRY_ISO } from "@/lib/countries";
import { formatPhoneDisplay, sanitizePhone } from "@/lib/whatsapp";
import { nextDeviceName, workerDisplayName } from "@/lib/device-name";
import { deviceConnectionInfo } from "@/lib/device-connection-info";
import type { SessionGatewayResponse, WaSession } from "@/types/wa";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({
    meta: [
      { title: "Perangkat WhatsApp — NAROWA" },
      { name: "description", content: "Kelola perangkat WhatsApp yang terhubung." },
      { property: "og:title", content: "Perangkat WhatsApp — NAROWA" },
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
      <div className="mx-auto flex size-64 max-w-full items-center justify-center rounded-lg border bg-background p-4 shadow-sm">
        <img src={value} alt="QR code untuk memasangkan WhatsApp" className="size-56 max-w-full" />
      </div>
    );
  }
  return (
    <div className="mx-auto flex size-64 max-w-full items-center justify-center rounded-lg border bg-background p-4 shadow-sm">
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
  const [pairingStartedAt, setPairingStartedAt] = useState<number | null>(null);
  const [pairingSeconds, setPairingSeconds] = useState(180);

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

  const { data: connectionStates } = useQuery({
    queryKey: ["wa-connection-info", (sessions ?? []).filter((session) => session.status !== "connected").map((session) => session.id).join(",")],
    enabled: Boolean(sessions?.some((session) => session.status !== "connected")),
    refetchInterval: 15_000,
    queryFn: async () => {
      const results = await Promise.allSettled(
        (sessions ?? []).filter((session) => session.status !== "connected").map((session) => getSessionState(session.id)),
      );
      const states: Record<string, SessionGatewayResponse> = {};
      for (const result of results) {
        if (result.status === "fulfilled") states[result.value.id] = result.value;
      }
      return states;
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

  const idleDevices = (sessions ?? []).filter(
    (session) => session.status === "connected" && !session.blast_ready,
  );
  const readyDevices = (sessions ?? []).filter(
    (session) => session.status === "connected" && session.blast_ready,
  );
  // Mode pintar: tidak ada perangkat idle berarti semua sudah standby blast,
  // sehingga tombol berubah fungsi menjadi Stop semua.
  const allStandby = idleDevices.length === 0 && readyDevices.length > 0;

  const [startAllSpeed, setStartAllSpeed] = useState("santai");

  const startAll = useMutation({
    mutationFn: async () => {
      if (allStandby) {
        for (const session of readyDevices) {
          await saveDeviceBlast({
            data: { session_id: session.id, ready: false },
          });
        }
        return { count: readyDevices.length, action: "stop" as const };
      }
      for (const session of idleDevices) {
        await saveDeviceBlast({
          data: { session_id: session.id, ready: true, speed: startAllSpeed },
        });
      }
      return { count: idleDevices.length, action: "start" as const };
    },
    onSuccess: ({ count, action }) => {
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
      toast.success(
        action === "stop"
          ? `${count} perangkat dihentikan dan kembali idle`
          : `${count} perangkat diaktifkan`,
      );
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

  // Jumlah pesan terkirim/gagal per perangkat, diagregasi di sisi klien.
  const { data: deviceStats } = useQuery({
    queryKey: ["device-message-stats"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_queue")
        .select("session_id,status")
        .not("session_id", "is", null)
        .limit(100000);
      if (error) throw error;
      const stats: Record<string, { sent: number; failed: number }> = {};
      for (const row of (data ?? []) as unknown as { session_id: string | null; status: string }[]) {
        if (!row.session_id) continue;
        const entry = (stats[row.session_id] ??= { sent: 0, failed: 0 });
        if (row.status === "sent") entry.sent += 1;
        else if (row.status === "failed") entry.failed += 1;
      }
      return stats;
    },
  });

  const activeQrSession = sessions?.find((s) => s.id === qrSessionId) ?? null;

  useEffect(() => {
    if (!pairingStartedAt || (!qrSessionId && !codeSessionId)) return;
    const update = () => setPairingSeconds(Math.max(0, 180 - Math.floor((Date.now() - pairingStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pairingStartedAt, qrSessionId, codeSessionId]);

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


  const createSession = useMutation({
    mutationFn: async () => {
      if ((sessions?.length ?? 0) >= MAX_DEVICES) {
        throw new Error(`Maksimal ${MAX_DEVICES} perangkat per akun.`);
      }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sesi pengguna tidak ditemukan.");
      const { data: existing, error: namesError } = await supabase.from("wa_sessions").select("session_name");
      if (namesError) throw namesError;
      if ((existing?.length ?? 0) >= MAX_DEVICES) throw new Error(`Maksimal ${MAX_DEVICES} perangkat per akun.`);
      const { data: profile } = await supabase.from("profiles").select("organization_name").eq("user_id", user.user.id).maybeSingle();
      const sessionName = name.trim() || nextDeviceName(
        workerDisplayName(profile?.organization_name, user.user.user_metadata, user.user.email),
        (existing ?? []).map((item) => item.session_name),
      );
      const { data, error } = await supabase
        .from("wa_sessions")

        .insert({
          user_id: user.user.id,
          session_name: sessionName,
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
      setNotes((current) => ({ ...current, [state.id]: null }));
      setPairingStartedAt(Date.now());
      setQrSessionId(state.id);
    },
    onError: (e: Error, id) => {
      setNotes((current) => ({ ...current, [id]: e.message }));
      toast.error(e.message);
    },
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
    if (!qrSessionId) setPairingStartedAt(Date.now());
    setQrSessionId(null);
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
    // Menghapus baris database saja meninggalkan sesi yatim di gateway (sesi itu tidak pernah
    // bisa ditemukan lagi karena id-nya hilang). Jalur server menghapus keduanya sekaligus.
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => {
      toast.success("Perangkat dihapus");
      queryClient.invalidateQueries({ queryKey: ["wa-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Pengirim WhatsApp"
        description="Kelola perangkat WhatsApp Anda untuk pengiriman pesan."
      />

      <div className="sm:hidden">
        <WaProfilePanel compact />
      </div>

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
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {!allStandby && (
              <Select value={startAllSpeed} onValueChange={setStartAllSpeed}>
                <SelectTrigger className="w-full sm:w-44">
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
            )}
            <Button
              variant={allStandby ? "destructive" : "outline"}
              className="w-full sm:w-auto"
              onClick={() => startAll.mutate()}
              disabled={
                startAll.isPending || (!allStandby && idleDevices.length === 0)
              }
            >
              {allStandby ? (
                <>
                  <Square className="mr-1 size-4" /> Stop semua
                  <span className="ml-2 rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs">{readyDevices.length}</span>
                </>
              ) : (
                <>
                  <Play className="mr-1 size-4" /> Start semua
                  <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs">{idleDevices.length}</span>
                </>
              )}
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setAddOpen(true)} disabled={(sessions?.length ?? 0) >= MAX_DEVICES}><Plus className="mr-1 size-5" /> Tambah perangkat <span className="ml-2 rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs">{sessions?.length ?? 0} / {MAX_DEVICES}</span></Button>
          </div>
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
          ["Rata-rata Speed", 0, "text-warning"],
        ].map(([label, value, tone]) => <Card key={String(label)} className="rounded-2xl shadow-none"><CardContent className="min-h-28 p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={cn("mt-3 text-2xl font-semibold", String(tone))}>{value}</p></CardContent></Card>)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(sessions ?? []).map((session) => {
          const live = connectionStates?.[session.id];
          const connection = live ?? session;
          const displayStatus = connection.status;
          return (
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
                <StatusBadge status={displayStatus} />
              </div>

              <div
                className={cn(
                  "mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                  displayStatus === "connected"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : displayStatus === "connecting"
                      ? "border-warning/40 bg-warning/15 text-warning"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {displayStatus === "connected" ? (
                  <Wifi className="size-3.5 shrink-0" />
                ) : (
                  <WifiOff className="size-3.5 shrink-0" />
                )}
                {displayStatus === "connected"
                  ? "Perangkat terhubung"
                  : displayStatus === "connecting"
                    ? "Perangkat sedang menghubungkan…"
                    : "Perangkat terputus"}
              </div>
              {displayStatus !== "connected" ? (
                <p role="status" className="mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{deviceConnectionInfo(connection)}</span>
                </p>
              ) : null}
              {notes[session.id] && displayStatus !== "connected" ? (
                <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">Percobaan menghubungkan gagal: {notes[session.id]}</p>
              ) : null}

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
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

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5">
                      {(deviceStats?.[session.id]?.sent ?? 0).toLocaleString("id-ID")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Pesan terkirim</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <XCircle className="size-4 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5">
                      {(deviceStats?.[session.id]?.failed ?? 0).toLocaleString("id-ID")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Pesan gagal</p>
                  </div>
                </div>
              </div>

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
        ); })}

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
              Nama boleh dikosongkan. Perangkat akan diberi nama otomatis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="device-name">Nama perangkat <span className="font-normal text-muted-foreground">(opsional)</span></Label>
            <Input
              id="device-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Otomatis: nama Worker-1"
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
        <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg px-5 py-7 sm:max-w-lg sm:px-8">
          <DialogHeader className="items-center space-y-3 text-center sm:text-center">
            <span className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary"><Smartphone className="size-6" /></span>
            <DialogTitle className="text-2xl">Tautkan WhatsApp</DialogTitle>
            <DialogDescription className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-4 py-1.5 font-mono text-xs font-semibold text-foreground"><Clock3 className="size-4 text-muted-foreground" /> Sisa waktu: {String(Math.floor(pairingSeconds / 60)).padStart(2, "0")}:{String(pairingSeconds % 60).padStart(2, "0")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="qr-device-name">Nama perangkat</Label><Input id="qr-device-name" value={activeQrSession?.session_name ?? ""} readOnly className="bg-muted/40" /></div>
          <div className="grid grid-cols-2 rounded-lg border bg-muted/40 p-1">
            <Button variant="ghost" className="h-auto min-h-10 px-2 text-xs sm:text-sm" onClick={() => qrSessionId && openCodeDialog(qrSessionId, activeQrSession?.phone_number ?? null)}>Gunakan 8-Digit Kode</Button>
            <Button variant="secondary" className="h-auto min-h-10 px-2 text-xs sm:text-sm">Scan Kode QR</Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">Buka WhatsApp di ponsel, pilih <strong className="text-foreground">Perangkat Tertaut</strong> lalu arahkan kamera ke QR berikut:</p>
          {activeQrSession?.qr_string ? (
            <QrView value={activeQrSession.qr_string} />
          ) : (
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Menunggu kode QR dari gateway…
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => activeQrSession && startPairing.mutate(activeQrSession.id)}
            >
              <RefreshCw className="mr-1 size-3.5" /> Perbarui QR
            </Button>
          </DialogFooter>
          <div role="status" className="rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning sm:text-sm">Menunggu konfirmasi tautan dari ponsel…</div>
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
        <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg px-5 py-7 sm:max-w-lg sm:px-8">
          <DialogHeader className="items-center space-y-3 text-center sm:text-center">
            <span className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary"><Smartphone className="size-6" /></span>
            <DialogTitle className="text-2xl">Tautkan WhatsApp</DialogTitle>
            <DialogDescription className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-4 py-1.5 font-mono text-xs font-semibold text-foreground"><Clock3 className="size-4 text-muted-foreground" /> Sisa waktu: {String(Math.floor(pairingSeconds / 60)).padStart(2, "0")}:{String(pairingSeconds % 60).padStart(2, "0")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="code-device-name">Nama perangkat</Label><Input id="code-device-name" value={sessions?.find((session) => session.id === codeSessionId)?.session_name ?? ""} readOnly className="bg-muted/40" /></div>
          <div className="grid grid-cols-2 rounded-lg border bg-muted/40 p-1">
            <Button variant="secondary" className="h-auto min-h-10 px-2 text-xs sm:text-sm">Gunakan 8-Digit Kode</Button>
            <Button variant="ghost" className="h-auto min-h-10 px-2 text-xs sm:text-sm" onClick={() => { const id = codeSessionId; setCodeSessionId(null); setPairingCode(null); if (id) startPairing.mutate(id); }}>Scan Kode QR</Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">Masukkan nomor WhatsApp aktif Anda dengan format internasional (contoh: <strong className="text-foreground">628123456789</strong>):</p>

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
              <p className="break-all font-mono text-2xl font-semibold">{pairingCode}</p>
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
          <div role="status" className="rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning sm:text-sm">Menunggu konfirmasi tautan dari ponsel…</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
