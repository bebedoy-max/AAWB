import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Smartphone, Wifi, Activity, CheckCircle2, XCircle, Wallet, Clock } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdminOverview, getDeviceMonitor } from "@/lib/monitor.functions";
import { rupiah } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/monitor")({
  head: () => ({
    meta: [
      { title: "Monitoring Real-time — AAWB" },
      { name: "description", content: "Pantau member, perangkat, dan pengiriman pesan secara real-time." },
      { property: "og:title", content: "Monitoring Real-time — AAWB" },
      { property: "og:description", content: "Pantau member, perangkat, dan pengiriman pesan secara real-time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MonitorPage,
});

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={
            accent
              ? "rounded-lg bg-primary/10 p-2 text-primary"
              : "rounded-lg bg-accent p-2 text-accent-foreground"
          }
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-lg font-semibold">{value}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function MonitorPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchDevices = useServerFn(getDeviceMonitor);

  const { data: o } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 5000,
  });
  const { data: devices } = useQuery({
    queryKey: ["admin-device-monitor"],
    queryFn: () => fetchDevices(),
    refetchInterval: 8000,
  });

  const totalMessages = (o?.sent_total ?? 0) + (o?.failed_total ?? 0) + (o?.pending_total ?? 0);
  const donePct = totalMessages
    ? Math.round((((o?.sent_total ?? 0) + (o?.failed_total ?? 0)) / totalMessages) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title="Monitoring Real-time"
        description="Kondisi member, perangkat, dan proses pengiriman pesan saat ini."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Jumlah member" value={String(o?.members ?? 0)} icon={Users} />
        <Stat label="Total perangkat" value={String(o?.devices_total ?? 0)} icon={Smartphone} />
        <Stat label="Perangkat terhubung" value={String(o?.devices_connected ?? 0)} icon={Wifi} />
        <Stat label="Sedang bekerja" value={String(o?.devices_working ?? 0)} icon={Activity} accent />
        <Stat label="Pesan sukses" value={String(o?.sent_total ?? 0)} icon={CheckCircle2} />
        <Stat label="Pesan gagal" value={String(o?.failed_total ?? 0)} icon={XCircle} />
        <Stat label="Pesan menunggu" value={String(o?.pending_total ?? 0)} icon={Clock} />
        <Stat label="Total pendapatan member" value={rupiah(o?.earnings_total ?? 0)} icon={Wallet} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Progres pengiriman keseluruhan</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={donePct} className="h-2.5" />
            <p className="mt-2 text-xs text-muted-foreground">
              {o?.sent_total ?? 0} terkirim · {o?.failed_total ?? 0} gagal · {o?.pending_total ?? 0} tersisa
              {" · "}
              {o?.pool_unclaimed ?? 0} nomor belum diambil member
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-accent/50 p-3 text-sm">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              {o?.sent_last_minute ?? 0} pesan terkirim dalam 1 menit terakhir
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Penarikan saldo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Menunggu persetujuan</span>
              <span className="font-medium">{rupiah(o?.withdrawal_pending ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sudah dibayar</span>
              <span className="font-medium">{rupiah(o?.withdrawal_paid ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Perangkat member</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Perangkat</th>
                <th className="px-4 py-2 font-medium">Pemilik</th>
                <th className="px-4 py-2 font-medium">Nomor</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Terkirim</th>
                <th className="px-4 py-2 font-medium">Gagal</th>
                <th className="px-4 py-2 font-medium">Aktivitas terakhir</th>
              </tr>
            </thead>
            <tbody>
              {(devices ?? []).map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{d.session_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{d.owner_email}</td>
                  <td className="px-4 py-2">{d.phone_number ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={d.working ? "default" : d.status === "connected" ? "secondary" : "outline"}>
                      {d.working ? "Bekerja" : d.status === "connected" ? "Terhubung" : "Tidak terhubung"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">{d.sent}</td>
                  <td className="px-4 py-2">{d.failed}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {d.last_activity ? new Date(d.last_activity).toLocaleString("id-ID") : "—"}
                  </td>
                </tr>
              ))}
              {devices?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Belum ada perangkat yang terdaftar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
