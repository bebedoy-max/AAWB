import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, CheckCircle2, Smartphone, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatPhoneDisplay } from "@/lib/whatsapp";
import type { QueuedMessage } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — WBlast" },
      { name: "description", content: "Ringkasan kinerja pengiriman WhatsApp Anda." },
      { property: "og:title", content: "Dashboard — WBlast" },
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

function Dashboard() {
  const queryClient = useQueryClient();

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

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Kesehatan pengiriman</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={stats?.deliveryRate ?? 0} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {stats?.sent ?? 0} terkirim · {stats?.failed ?? 0} gagal · {stats?.pending ?? 0} dalam antrean
          </p>
        </CardContent>
      </Card>

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
