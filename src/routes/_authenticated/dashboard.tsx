import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Send, Smartphone, TrendingUp, AlertTriangle, Download, Pin, UserRound, QrCode, Wallet, Users, Copy, Plus, KeyRound, RefreshCw } from "lucide-react";
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
import { rupiah } from "@/lib/currency";
import { getMyReferral, getMyRewards } from "@/lib/rewards.functions";
import { getSupportTelegram } from "@/lib/admin.functions";
import { WaProfilePanel } from "@/components/wa-profile-panel";
import type { QueuedMessage, SessionGatewayResponse, WaSession } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AAWB" },
      { name: "description", content: "Ringkasan kinerja pengiriman WhatsApp Anda." },
      { property: "og:title", content: "Dashboard — AAWB" },
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
  const [pairingSession, setPairingSession] = useState<SessionGatewayResponse | null>(null);
  const [pairingMode, setPairingMode] = useState<"qr" | "code">("qr");
  const [codeCountry, setCodeCountry] = useState(DEFAULT_COUNTRY_ISO);
  const [codePhone, setCodePhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const fetchRewards = useServerFn(getMyRewards);
  const fetchReferral = useServerFn(getMyReferral);

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
      const { data, error } = await supabase
        .from("wa_sessions")
        .insert({
          user_id: userData.user.id,
          session_name: deviceName.trim() || "Perangkat baru",
          status: "disconnected",
        })
        .select()
        .single();
      if (error) throw error;
      const session = data as WaSession;
      return sessionAction(session.id, "start");
    },
    onSuccess: async (session) => {
      setAddDeviceOpen(false);
      setDeviceName("");
      setPairingMode("qr");
      setPairingCode(null);
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
    onSuccess: (session) => setPairingSession(session),
    onError: (error: Error) => toast.error(error.message),
  });

  const pairWithCode = useMutation({
    mutationFn: async () => {
      if (!pairingSession) throw new Error("Perangkat belum dipilih.");
      const phone = sanitizePhone(codePhone, countryByIso(codeCountry).dial);
      if (phone.length < 8) throw new Error("Masukkan nomor WhatsApp yang valid.");
      return requestPairingCode(pairingSession.id, phone);
    },
    onSuccess: (result) => setPairingCode(result.code),
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!pairingSession) return;
    const sessionId = pairingSession.id;
    const timer = window.setInterval(async () => {
      try {
        const state = await getSessionState(sessionId);
        setPairingSession(state);
        if (state.status === "connected") {
          window.clearInterval(timer);
          toast.success("Perangkat berhasil terhubung");
          setPairingSession(null);
          setPairingCode(null);
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
             <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold"><span className="size-2 rounded-full bg-primary" /> SISTEM AKTIF</span>
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
            <div className="mt-4 rounded-xl border border-warning-border bg-warning-surface p-4"><p className="font-semibold text-warning-foreground">{rewards?.payout.number ? "Rekening terhubung" : "Rekening belum terhubung"}</p><p className="mt-1 text-xs text-warning-foreground">Atur rekening tujuan penarikan Anda.</p></div>
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
              <p className="text-sm font-semibold text-warning-foreground">{rewards?.payout.number ? "Rekening terhubung" : "Rekening belum terhubung"}</p>
              <Link to="/rewards" className="mt-1 inline-block text-xs text-warning-foreground underline">Atur rekening sekarang →</Link>
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
              <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="size-5" /></div>
              <p className="text-lg font-semibold">Laporkan Kendala</p>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Menemukan kendala teknis saat memakai sistem? Tekan tombol di bawah untuk melapor langsung ke tim bantuan kami di Telegram.
            </p>
            <Button
              className="mt-auto w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!support?.url}
              asChild={Boolean(support?.url)}
            >
              {support?.url ? (
                <a href={support.url} target="_blank" rel="noopener noreferrer">
                  <Send className="mr-2 size-4" /> Hubungi via Telegram
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

      <Dialog open={addDeviceOpen} onOpenChange={setAddDeviceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah perangkat WhatsApp</DialogTitle>
            <DialogDescription>
              Beri nama perangkat, lalu lanjutkan proses pemasangan WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-device-name">Nama perangkat</Label>
            <Input
              id="dashboard-device-name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="Nomor penjualan 1"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !createDevice.isPending) createDevice.mutate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={() => createDevice.mutate()} disabled={createDevice.isPending}>
              {createDevice.isPending ? "Membuat…" : "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pairingSession)}
        onOpenChange={(open) => {
          if (!open) {
            setPairingSession(null);
            setPairingCode(null);
            setCodePhone("");
            void Promise.all([
              queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
              queryClient.invalidateQueries({ queryKey: ["wa-sessions"] }),
            ]).then(() => navigate({ to: "/devices" }));
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pasangkan perangkat WhatsApp</DialogTitle>
            <DialogDescription>
              Pindai QR atau pilih pemasangan melalui kode. Halaman WhatsApp terbuka otomatis setelah terhubung.
            </DialogDescription>
          </DialogHeader>

          {pairingMode === "qr" ? (
            <div className="space-y-4">
              {pairingSession?.qr_string ? (
                pairingSession.qr_string.startsWith("data:image") ? (
                  <div className="flex justify-center rounded-lg bg-background p-3">
                    <img src={pairingSession.qr_string} alt="QR pemasangan WhatsApp" className="size-56" />
                  </div>
                ) : (
                  <div className="flex justify-center rounded-lg bg-background p-3">
                    <QRCodeSVG value={pairingSession.qr_string} size={224} level="M" />
                  </div>
                )
              ) : (
                <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  Menunggu kode QR dari gateway…
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Status pemasangan</span>
                <StatusBadge status={pairingSession?.status ?? "connecting"} />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => refreshPairing.mutate()}
                disabled={refreshPairing.isPending}
              >
                <RefreshCw className="size-4" /> Perbarui QR
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setPairingMode("code")}
              >
                <KeyRound className="size-4" /> Pasangkan via kode
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
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
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setPairingMode("qr");
                  setPairingCode(null);
                }}
              >
                <QrCode className="size-4" /> Kembali ke QR
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
