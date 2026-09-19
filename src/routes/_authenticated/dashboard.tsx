import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Smartphone, TrendingUp, AlertTriangle, Download, Pin, UserRound, QrCode, Wallet, Users, ArrowRight, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/my-client";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPhoneDisplay } from "@/lib/whatsapp";
import { rupiah } from "@/lib/currency";
import { getMyReferral, getMyRewards } from "@/lib/rewards.functions";
import { getSupportTelegram } from "@/lib/admin.functions";
import type { QueuedMessage } from "@/types/wa";

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
}: {
  icon: typeof Send;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="rounded-2xl border-border bg-member-panel shadow-panel transition-colors hover:border-primary/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
           <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        </div>
         <p className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
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

  const copyProfileName = async () => {
    const { data } = await supabase.auth.getUser();
    const metadata = data.user?.user_metadata as { organization_name?: string; username?: string } | undefined;
    const profileName = metadata?.organization_name ?? metadata?.username ?? "Worker's";
    await navigator.clipboard.writeText(profileName);
    toast.success("Nama profil disalin");
  };

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

      <section className="mb-6 rounded-2xl border border-warning-border bg-warning-surface p-5 shadow-panel sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-warning">PERHATIAN: ATUR PROFIL</h2>
            <p className="mt-1 text-sm text-foreground/85">Gunakan nama dan foto profil yang ditentukan sebelum mulai mengirim pesan.</p>
            <div className="mt-4 rounded-lg border border-warning-border bg-background/25 p-3 text-xs font-semibold text-warning-foreground"><Pin className="mr-2 inline size-3.5 text-warning" />Jika mengerjakan data, simpan bukti aktivitas sesuai arahan admin.</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
               <div className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-warning/70 bg-member-panel"><UserRound className="size-5 text-foreground/70" /></div>
              <Button size="sm" asChild><a href="/aawb-wordmark.png" download="foto-profil-aawb.png"><Download className="mr-1.5 size-4" /> Unduh foto profil</a></Button>
              <Button size="sm" variant="outline" onClick={() => void copyProfileName()}>Salin nama profil</Button>
            </div>
          </div>
        </div>
      </section>

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
        />
      </div>

      <div className="mt-5 space-y-4 sm:hidden">
        <Card className="rounded-2xl shadow-panel">
          <CardContent className="p-5">
            <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><QrCode className="size-5" /></div><div><p className="text-lg font-semibold">Hubungkan perangkat baru</p><p className="text-sm text-muted-foreground">Pindai QR untuk menambahkan nomor WhatsApp.</p></div></div>
            <Button className="mt-5 w-full" asChild><Link to="/devices"><QrCode className="mr-2 size-5" /> Pindai nomor baru <ArrowRight className="ml-auto size-4" /></Link></Button>
          </CardContent>
        </Card>

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
    </>
  );
}
