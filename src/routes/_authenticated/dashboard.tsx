import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, CheckCircle2, Smartphone, Clock, TrendingUp, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
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
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

type SparkPoint = { hari: string; jumlah: number };

function EarningCard({
  icon: Icon,
  label,
  value,
  hint,
  data,
  gradientId,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  hint?: string;
  data: SparkPoint[];
  gradientId: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}

        <div className="mt-4 -mx-5 -mb-5">
          {data.length === 0 ? (
            <div className="flex h-24 items-end px-5 pb-4">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>
          ) : (
            <ChartContainer
              className="h-24 w-full"
              config={{ jumlah: { label: "Penghasilan", color: "var(--primary)" } }}
            >
              <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-jumlah)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-jumlah)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ChartTooltip
                  content={({ active, payload, label: l }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="text-muted-foreground">{l}</p>
                        <p className="font-medium text-foreground">
                          {rupiah(Number(payload[0]?.value ?? 0))}
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="jumlah"
                  stroke="var(--color-jumlah)"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
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

  const buildSeries = (kinds?: string[]): SparkPoint[] => {
    const ledger = (rewards?.ledger ?? []).filter((l) => !kinds || kinds.includes(l.kind));
    const byDay = new Map<string, number>();
    for (const l of ledger) {
      const day = new Date(l.created_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      });
      byDay.set(day, (byDay.get(day) ?? 0) + Number(l.amount ?? 0));
    }
    let total = 0;
    return Array.from(byDay.entries())
      .reverse()
      .map(([hari, jumlah]) => {
        total += jumlah;
        return { hari, jumlah: total };
      });
  };

  const totalSeries = useMemo(() => buildSeries(), [rewards?.ledger]);
  const referralSeries = useMemo(() => buildSeries(["referral"]), [rewards?.ledger]);

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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Ringkasan langsung kinerja pengiriman WhatsApp Anda."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Send}
          label="Total terkirim"
          value={String(stats?.sent ?? 0)}
          hint={`${stats?.contacts ?? 0} kontak dalam daftar penerima`}
        />
        <StatCard
          icon={CheckCircle2}
          label="Tingkat pengiriman"
          value={`${stats?.deliveryRate ?? 0}%`}
          hint={`${stats?.failed ?? 0} pengiriman gagal`}
        />
        <StatCard
          icon={Smartphone}
          label="Perangkat aktif"
          value={String(stats?.sessions ?? 0)}
          hint="Perangkat WhatsApp terhubung"
        />
        <StatCard
          icon={Clock}
          label="Antrean tertunda"
          value={String(stats?.pending ?? 0)}
          hint="Pesan menunggu dikirim"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <EarningCard
          icon={TrendingUp}
          label="Total penghasilan"
          value={rupiah(rewards?.total_earned)}
          hint={`Sudah dicairkan ${rupiah(rewards?.total_withdrawn)}`}
          data={totalSeries}
          gradientId="sparkTotal"
        />
        <EarningCard
          icon={Users}
          label="Bonus referal"
          value={rupiah(rewards?.from_referral)}
          hint={`Reward pesan ${rupiah(rewards?.from_messages)}`}
          data={referralSeries}
          gradientId="sparkReferral"
        />
      </div>


      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Aktivitas pengiriman terbaru</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(activity ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada pesan. Jalankan kampanye untuk melihat aktivitas di sini.
            </p>
          ) : (
            activity!.map((item) => (
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
