import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Smartphone, TrendingUp, AlertTriangle, Download, Pin, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/my-client";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPhoneDisplay } from "@/lib/whatsapp";
import { rupiah } from "@/lib/currency";
import { getMyRewards } from "@/lib/rewards.functions";
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
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
           <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
  const fetchRewards = useServerFn(getMyRewards);

  const { data: rewards } = useQuery({
    queryKey: ["my-rewards"],
    queryFn: () => fetchRewards(),
    refetchInterval: 20_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [sent, failed, pending, sessions, contacts] = await Promise.all([
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

  const copyProfileName = async () => {
    const { data } = await supabase.auth.getUser();
    const metadata = data.user?.user_metadata as { organization_name?: string; username?: string } | undefined;
    const profileName = metadata?.organization_name ?? metadata?.username ?? "Member";
    await navigator.clipboard.writeText(profileName);
    toast.success("Nama profil disalin");
  };

  return (
    <>
      <section className="mb-6 rounded-2xl bg-member-hero px-6 py-8 text-member-hero-foreground shadow-panel sm:px-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Selamat datang!</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-member-hero-foreground/70">Kelola aktivitas WhatsApp dan pantau seluruh perkembangan pengiriman dari sini.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-member-hero-foreground/20 bg-background/40 px-4 py-2 text-xs font-semibold">Masuk sebagai MEMBER</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold"><span className="size-2 rounded-full bg-primary" /> SISTEM AKTIF</span>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={TrendingUp} label="Total Penghasilan" value={rupiah(rewards?.total_earned ?? 0)} hint={`Penarikan ${rupiah(rewards?.total_withdrawn ?? 0)}`} />
        <StatCard icon={Send} label="Pesan Terkirim" value={String(stats?.sent ?? 0)} hint={`${stats?.pending ?? 0} dalam antrean`} />
        <StatCard
          icon={Smartphone}
          label="Perangkat Offline"
          value={String(Math.max(0, 4 - (stats?.sessions ?? 0)))}
          hint={`${stats?.sessions ?? 0} perangkat aktif`}
        />
      </div>


      <Card className="mt-5 overflow-hidden rounded-2xl border-border bg-member-panel shadow-panel">
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
