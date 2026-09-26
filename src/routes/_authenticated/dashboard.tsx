import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Send, Smartphone, TrendingUp, Download, Pin, UserRound, Wallet, Users, Copy, Plus, RefreshCw, Database, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/my-client";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import { countryByIso, DEFAULT_COUNTRY_ISO } from "@/lib/countries";
import { getSessionState, requestPairingCode, sessionAction } from "@/lib/api-client";
import { formatPhoneDisplay, sanitizePhone } from "@/lib/whatsapp";
import { nextDeviceName, workerDisplayName } from "@/lib/device-name";
import { deviceConnectionInfo } from "@/lib/device-connection-info";
import { rupiah } from "@/lib/currency";
import { getMyReferral, getMyRewards } from "@/lib/rewards.functions";
import { getSupportTelegram } from "@/lib/admin.functions";
import { getBlastState } from "@/lib/blast.functions";
import { WaProfilePanel } from "@/components/wa-profile-panel";
import type { QueuedMessage, SessionGatewayResponse, WaSession } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — NAROWA" },
      { name: "description", content: "Ringkasan kinerja pengiriman WhatsApp Anda." },
      { property: "og:title", content: "Dashboard — NAROWA" },
      { property: "og:description", content: "Ringkasan kinerja pengiriman WhatsApp Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  action,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="relative rounded-2xl border-border bg-member-panel shadow-panel transition-colors hover:border-primary/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
           <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        </div>
         <p className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        {action ? <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/dashboard" });
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [createdDeviceName, setCreatedDeviceName] = useState("");
  const [pairingSession, setPairingSession] = useState<SessionGatewayResponse | null>(null);
  const [pairingMode, setPairingMode] = useState<"qr" | "code">("qr");
  const [codeCountry, setCodeCountry] = useState(DEFAULT_COUNTRY_ISO);
  const [codePhone, setCodePhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStartedAt, setPairingStartedAt] = useState<number | null>(null);
  const [pairingSeconds, setPairingSeconds] = useState(180);
  const [pairingIssue, setPairingIssue] = useState<string | null>(null);
  const fetchRewards = useServerFn(getMyRewards);
  const fetchReferral = useServerFn(getMyReferral);
  const fetchBlastState = useServerFn(getBlastState);

  const { data: rewards } = useQuery({
    queryKey: ["my-rewards"],
    queryFn: () => fetchRewards(),
    refetchInterval: 20_000,
  });
  const { data: referral } = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => fetchReferral(),
    refetchInterval: 30_000,
  });
  const { data: blastState } = useQuery({
    queryKey: ["member-blast-state"],
    queryFn: () => fetchBlastState(),
    refetchInterval: 10_000,
  });

  const fetchSupport = useServerFn(getSupportTelegram);
  const { data: support } = useQuery({
    queryKey: ["support-telegram"],
    queryFn: () => fetchSupport(),
    staleTime: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [sent, failed, pending, sessions, devices, contacts] = await Promise.all([
        supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("message_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase
          .from("message_queue")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "processing"]),
        supabase
          .from("wa_sessions")
          .select("id", { count: "exact", head: true })
          .eq("status", "connected"),
        supabase.from("wa_sessions").select("id", { count: "exact", head: true }),
        supabase.from("contacts").select("id", { count: "exact", head: true }),
      ]);
      const sentCount = sent.count ?? 0;
      const failedCount = failed.count ?? 0;
      const total = sentCount + failedCount;
      return {
        sent: sentCount,
        failed: failedCount,
        pending: pending.count ?? 0,
        sessions: sessions.count ?? 0,
        devices: devices.count ?? 0,
        contacts: contacts.count ?? 0,
        deliveryRate: total ? Math.round((sentCount / total) * 100) : 0,
      };
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["recent-activity"],
    refetchInterval: 8000,
    queryFn: async () => {
      const { data } = await supabase
        .from("message_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as QueuedMessage[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_queue" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const copyReferralLink = async () => {
    if (!referral?.link) return;
    await navigator.clipboard.writeText(referral.link);
    toast.success("Link referal disalin");
  };


  const createDevice = useMutation({
    mutationFn: async () => {
      if ((stats?.devices ?? 0) >= 4) {
        throw new Error("Maksimal 4 perangkat per akun.");
      }
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sesi pengguna tidak ditemukan.");
      const { data: existing, error: namesError } = await supabase.from("wa_sessions").select("session_name");
      if (namesError) throw namesError;
      if ((existing?.length ?? 0) >= 4) throw new Error("Maksimal 4 perangkat per akun.");
      const { data: profile } = await supabase.from("profiles").select("organization_name").eq("user_id", userData.user.id).maybeSingle();
      const sessionName = deviceName.trim() || nextDeviceName(
        workerDisplayName(profile?.organization_name, userData.user.user_metadata, userData.user.email),
        (existing ?? []).map((item) => item.session_name),
      );
      const { data, error } = await supabase
        .from("wa_sessions")
        .insert({
          user_id: userData.user.id,
          session_name: sessionName,
          status: "disconnected",
        })
        .select()
        .single();
      if (error) throw error;
      const session = data as WaSession;
      setCreatedDeviceName(sessionName);
      return sessionAction(session.id, "start");
    },
    onSuccess: async (session) => {
      setDeviceName("");
      setPairingMode("qr");
      setPairingCode(null);
      setPairingStartedAt(Date.now());
      setPairingSession(session);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["wa-sessions"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refreshPairing = useMutation({
    mutationFn: async () => {
      if (!pairingSession) throw new Error("Perangkat belum dipilih.");
      return sessionAction(pairingSession.id, "start");
    },
    onSuccess: (session) => { setPairingSession(session); setPairingStartedAt(Date.now()); setPairingIssue(null); },
    onError: (error: Error) => { setPairingIssue(error.message); toast.error(error.message); },
  });

  const pairWithCode = useMutation({
    mutationFn: async () => {
      if (!pairingSession) throw new Error("Perangkat belum dipilih.");
      const phone = sanitizePhone(codePhone, countryByIso(codeCountry).dial);
      if (phone.length < 8) throw new Error("Masukkan nomor WhatsApp yang valid.");
      return requestPairingCode(pairingSession.id, phone);
    },
    onSuccess: (result) => { setPairingCode(result.code); setPairingIssue(null); },
    onError: (error: Error) => { setPairingIssue(error.message); toast.error(error.message); },
  });

  useEffect(() => {
    if (!pairingStartedAt || !pairingSession) return;
    const update = () => setPairingSeconds(Math.max(0, 180 - Math.floor((Date.now() - pairingStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pairingStartedAt, pairingSession?.id]);

  useEffect(() => {
    if (!pairingSession) return;
    const sessionId = pairingSession.id;
    const timer = window.setInterval(async () => {
      try {
        const state = await getSessionState(sessionId);
        setPairingSession(state);
        setPairingIssue((current) => state.status === "disconnected" ? deviceConnectionInfo(state) : current);
        if (state.status === "connected") {
          window.clearInterval(timer);
          toast.success("Perangkat berhasil terhubung");
          setPairingSession(null);
          setAddDeviceOpen(false);
            setPairingCode(null);
            setPairingIssue(null);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
            queryClient.invalidateQueries({ queryKey: ["wa-sessions"] }),
          ]);
          await navigate({ to: "/devices" });
        }
      } catch {
        // Tetap memantau ketika gateway sedang memperbarui sesi.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [pairingSession?.id, navigate, queryClient]);

  return (
    <>
      <section className="mb-6 rounded-[2rem] bg-foreground px-7 py-10 text-background shadow-panel sm:bg-member-hero sm:px-8 sm:text-member-hero-foreground">
        <div>
          <h1 className="font-display text-[2rem] font-bold tracking-normal">Selamat datang!</h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-background/70 sm:mt-2 sm:text-sm sm:leading-6 sm:text-member-hero-foreground/70">Kelola aktivitas WhatsApp dan pantau seluruh perkembangan pengiriman dari sini.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
             <span className="rounded-full border border-background/20 bg-background/5 px-4 py-2.5 text-xs font-semibold sm:border-member-hero-foreground/20 sm:bg-background/40">Masuk sebagai WORKER'S</span>
             <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold">
               <Database className="size-4 text-primary" />
               Data tersisa: {(blastState?.pool_available ?? 0).toLocaleString("id-ID")}
             </span>
          </div>
        </div>
      </section>

      <WaProfilePanel />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 [&>*:last-child]:col-span-1">
        <StatCard icon={TrendingUp} label="Total Penghasilan" value={rupiah(rewards?.total_earned ?? 0)} hint={`Penarikan ${rupiah(rewards?.total_withdrawn ?? 0)}`} />
        <StatCard icon={Send} label="Pesan Terkirim" value={String(stats?.sent ?? 0)} hint={`${stats?.pending ?? 0} dalam antrean`} />
        <StatCard
          icon={Smartphone}
          label="Perangkat Terhubung"
          value={`${stats?.sessions ?? 0} / ${stats?.devices ?? 0}`}
          hint={
            (stats?.devices ?? 0) === 0
              ? "Belum ada perangkat terdaftar"
              : `${Math.max(0, (stats?.devices ?? 0) - (stats?.sessions ?? 0))} perangkat offline`
          }
          action={
            <Button
              size="sm"
              onClick={() => setAddDeviceOpen(true)}
              disabled={(stats?.devices ?? 0) >= 4}
            >
              <Plus className="size-4" /> Tambah Perangkat
            </Button>
          }
        />
      </div>

      <div className="mt-5 space-y-4 sm:hidden">
        <Card className="rounded-2xl shadow-panel">
          <CardContent className="p-5">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Total saldo tersedia</p><p className="mt-4 text-3xl font-semibold">{rupiah(rewards?.balance ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">Minimum penarikan: {rupiah(rewards?.settings.min_withdrawal ?? 0)}</p></div><div className="grid size-11 place-items-center rounded-xl bg-warning text-warning-foreground"><Wallet className="size-5" /></div></div>
            <div className="mt-4 rounded-xl border border-warning-border bg-warning-surface p-4"><p className="font-semibold text-warning-surface-foreground">{rewards?.payout.number ? "Rekening terhubung" : "Rekening belum terhubung"}</p><p className="mt-1 text-xs text-warning-surface-foreground/80">Atur rekening tujuan penarikan Anda.</p></div>
            <Button className="mt-5 w-full" asChild><Link to="/rewards"><Wallet className="mr-2 size-5" /> Klaim saldo</Link></Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-panel">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground"><Users className="size-5" /></div><p className="text-lg font-semibold">Program Afiliasi</p></div><Button variant="ghost" size="sm" asChild><Link to="/referral">Lihat detail</Link></Button></div>
            <div className="mt-5 rounded-xl border p-4"><p className="text-xs text-muted-foreground">Kode referal Anda</p><p className="mt-2 text-xl font-semibold">{referral?.code ?? "······"}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 hidden gap-4 sm:grid lg:grid-cols-3">
        <Card className="rounded-2xl border-border bg-member-panel shadow-panel">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total saldo tersedia</p>
                <p className="mt-3 text-3xl font-semibold">{rupiah(rewards?.balance ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Minimum penarikan: {rupiah(rewards?.settings.min_withdrawal ?? 0)}</p>
              </div>
              <div className="grid size-10 place-items-center rounded-xl bg-warning text-warning-foreground"><Wallet className="size-5" /></div>
            </div>
            <div className="mt-4 rounded-xl border border-warning-border bg-warning-surface p-4">
              <p className="text-sm font-semibold text-warning-surface-foreground">{rewards?.payout.number ? "Rekening terhubung" : "Rekening belum terhubung"}</p>
              <Link to="/rewards" className="mt-1 inline-block text-xs text-warning-surface-foreground underline">Atur rekening sekarang →</Link>
            </div>
            <Button className="mt-auto w-full" asChild><Link to="/rewards"><Wallet className="mr-2 size-4" /> Klaim saldo</Link></Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-member-panel shadow-panel">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground"><Users className="size-5" /></div>
                <p className="text-lg font-semibold">Program Afiliasi</p>
              </div>
              <Button variant="ghost" size="sm" asChild><Link to="/referral">Lihat detail</Link></Button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Kode referal Anda</p>
                <p className="mt-1 truncate text-xl font-semibold">{referral?.code ?? "······"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void copyReferralLink()}><Copy className="mr-1.5 size-4" /> Salin link</Button>
            </div>
            <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-xs text-foreground/80">
              Dapatkan komisi {rupiah(referral?.settings.referral_rate_l1 ?? 0)} untuk setiap pesan yang dikirim tim Anda.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Komisi tim</p><p className="mt-1 font-semibold">{rupiah(referral?.total_bonus ?? 0)}</p></div>
              <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Anggota tim</p><p className="mt-1 font-semibold">{referral?.total_team ?? 0} orang</p></div>
              <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Pesan tim</p><p className="mt-1 font-semibold">{referral?.team_messages ?? 0}</p></div>
              <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Perangkat saya</p><p className="mt-1 font-semibold">{stats?.sessions ?? 0} aktif</p></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-member-panel shadow-panel">
          <CardContent className="flex h-full flex-col p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><Send className="size-5" /></div>
              <p className="text-lg font-semibold">Group Public</p>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Menemukan kendala teknis saat memakai sistem? Atau ingin mendapatkan informasi terupdate dari NAROWA.. Tekan tombol di bawah untuk melapor langsung ke tim bantuan dan bergabung di Channel kami di Telegram.
            </p>
            <Button
              className="mt-auto w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!support?.url}
              asChild={Boolean(support?.url)}
            >
              {support?.url ? (
                <a href={support.url} target="_blank" rel="noopener noreferrer">
                  <Send className="mr-2 size-4" /> Join Telegram Channel
                </a>
              ) : (
                <span>Kontak Telegram belum diatur admin</span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 hidden overflow-hidden rounded-2xl border-border bg-member-panel shadow-panel sm:block">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base">Aktivitas pengiriman terbaru</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {(activity ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada pesan. Jalankan kampanye untuk melihat aktivitas di sini.
            </p>
          ) : (
            (activity ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{formatPhoneDisplay(item.recipient_phone)}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.message_body}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addDeviceOpen || Boolean(pairingSession)}
        onOpenChange={(open) => {
          if (!open) {
            setAddDeviceOpen(false);
            setPairingSession(null);
            setPairingCode(null);
            setCodePhone("");
            setCreatedDeviceName("");
            void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg px-5 py-7 sm:max-w-lg sm:px-8">
          <DialogHeader className="items-center space-y-3 text-center sm:text-center">
            <span className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary"><Smartphone className="size-6" /></span>
            <DialogTitle className="text-2xl">{pairingSession ? "Tautkan WhatsApp" : "Tambah perangkat WhatsApp"}</DialogTitle>
            {pairingSession ? (
              <DialogDescription className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-4 py-1.5 font-mono text-xs font-semibold text-foreground">
                <Clock3 className="size-4 text-muted-foreground" /> Sisa waktu: {String(Math.floor(pairingSeconds / 60)).padStart(2, "0")}:{String(pairingSeconds % 60).padStart(2, "0")}
              </DialogDescription>
            ) : <DialogDescription>Nama boleh dikosongkan. Perangkat akan diberi nama otomatis.</DialogDescription>}
          </DialogHeader>

          {!pairingSession ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-device-name">Nama perangkat <span className="font-normal text-muted-foreground">(opsional)</span></Label>
                <Input id="dashboard-device-name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Otomatis: nama Worker-1" onKeyDown={(event) => { if (event.key === "Enter" && !createDevice.isPending) createDevice.mutate(); }} autoFocus />
              </div>
              <DialogFooter><Button className="w-full sm:w-auto" onClick={() => createDevice.mutate()} disabled={createDevice.isPending}>{createDevice.isPending ? "Membuat…" : "Buat & pasangkan"}</Button></DialogFooter>
            </>
          ) : <>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-pairing-device-name">Nama perangkat</Label>
            <Input id="dashboard-pairing-device-name" value={createdDeviceName} readOnly className="bg-muted/40" />
          </div>
          <div className="grid grid-cols-2 rounded-lg border bg-muted/40 p-1">
            <Button type="button" variant={pairingMode === "code" ? "secondary" : "ghost"} className="h-auto min-h-10 px-2 text-xs sm:text-sm" onClick={() => setPairingMode("code")}>Gunakan 8-Digit Kode</Button>
            <Button type="button" variant={pairingMode === "qr" ? "secondary" : "ghost"} className="h-auto min-h-10 px-2 text-xs sm:text-sm" onClick={() => setPairingMode("qr")}>Scan Kode QR</Button>
          </div>

          {pairingMode === "qr" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">Buka WhatsApp di ponsel, pilih <strong className="text-foreground">Perangkat Tertaut</strong> lalu arahkan kamera ke QR berikut:</p>
              {pairingSession?.qr_string ? (
                pairingSession.qr_string.startsWith("data:image") ? (
                  <div className="mx-auto flex size-64 max-w-full items-center justify-center rounded-lg border bg-card p-3 shadow-sm">
                    <img src={pairingSession.qr_string} alt="QR pemasangan WhatsApp" className="size-56 max-w-full invert" />
                  </div>
                ) : (
                  <div className="mx-auto flex size-64 max-w-full items-center justify-center rounded-lg border bg-card p-3 shadow-sm">
                    <QRCodeSVG value={pairingSession.qr_string} size={224} level="M" bgColor="#ffffff" fgColor="#000000" marginSize={2} />
                  </div>
                )
              ) : (
                <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  Menunggu kode QR dari gateway…
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshPairing.mutate()}
                disabled={refreshPairing.isPending}
              >
                <RefreshCw className="size-4" /> Perbarui QR
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
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
                    <Copy className="size-4" /> Salin kode
                  </Button>
                </div>
              ) : null}
              <Button
                className="w-full"
                onClick={() => pairWithCode.mutate()}
                disabled={pairWithCode.isPending || Boolean(pairingCode)}
              >
                {pairingCode ? "Menunggu perangkat terhubung" : "Minta kode pemasangan"}
              </Button>
            </div>
          )}
          <div role="status" className="mx-auto rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning sm:text-sm">
            {pairingIssue ?? "Menunggu konfirmasi tautan dari ponsel…"}
          </div>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
