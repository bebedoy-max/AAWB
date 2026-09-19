/** Ringkasan sistem: statistik utama, pintasan, dan kendali blast global. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  FileText,
  ListChecks,
  OctagonX,
  RefreshCw,
  Send,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getAdminOverview, listBlastProjects } from "@/lib/monitor.functions";
import { stopAllBlast } from "@/lib/admin-console.functions";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  angka,
  rupiah,
  waktu,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Ringkasan Sistem — AAWB" },
      { name: "description", content: "Pantau kondisi Worker's, perangkat, dan kampanye AAWB." },
      { property: "og:title", content: "Ringkasan Sistem — AAWB" },
      { property: "og:description", content: "Pantau kondisi Worker's, perangkat, dan kampanye AAWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RingkasanPage,
});

const SHORTCUTS = [
  { to: "/admin/pengguna", label: "Pengguna", icon: Users },
  { to: "/admin/kampanye", label: "Kampanye", icon: Send },
  { to: "/admin/nomor", label: "Data Nomor", icon: ListChecks },
  { to: "/admin/laporan", label: "Laporan", icon: FileText },
  { to: "/admin/klaim", label: "Klaim Dana", icon: Wallet },
] as const;

function RingkasanPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchProjects = useServerFn(listBlastProjects);
  const stopAll = useServerFn(stopAllBlast);

  const { data: overview, isFetching, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 20_000,
  });

  const { data: projects } = useQuery({
    queryKey: ["blast-projects"],
    queryFn: () => fetchProjects(),
    refetchInterval: 20_000,
  });

  const running = (projects ?? []).filter((p) => p.status === "running");

  const stop = useMutation({
    mutationFn: () => stopAll(),
    onSuccess: () => {
      toast.success("Semua blast dihentikan");
      queryClient.invalidateQueries({ queryKey: ["blast-projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AdminPageTitle
        title="Ringkasan Sistem"
        description="Pantau kondisi Worker's, perangkat, dan kampanye yang sedang berjalan."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={stop.isPending}>
                  <OctagonX className="mr-2 size-4" />
                  Hentikan semua blast
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hentikan seluruh pengiriman?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Semua kampanye yang berjalan akan dijeda dan mesin blast pada perangkat Worker's
                    dimatikan. Antrean nomor tidak dihapus.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => stop.mutate()}>Hentikan</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Worker's"
          value={angka(overview?.members ?? 0)}
          icon={Users}
          tone="info"
        />
        <StatTile
          label="Target siap kirim"
          value={angka(overview?.pool_unclaimed ?? 0)}
          hint={`${angka(overview?.pending_total ?? 0)} total antrean`}
          icon={ListChecks}
          tone="warning"
        />
        <StatTile
          label="Perangkat terdaftar"
          value={angka(overview?.devices_total ?? 0)}
          icon={Smartphone}
          tone="muted"
        />
        <StatTile
          label="Perangkat aktif"
          value={angka(overview?.devices_connected ?? 0)}
          hint={`${angka(overview?.devices_working ?? 0)} sedang mengirim`}
          icon={Activity}
          tone="success"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Pesan terkirim"
          value={angka(overview?.sent_total ?? 0)}
          hint={`${angka(overview?.sent_last_minute ?? 0)} pada menit terakhir`}
          icon={Send}
          tone="success"
        />
        <StatTile
          label="Pesan gagal"
          value={angka(overview?.failed_total ?? 0)}
          icon={OctagonX}
          tone="danger"
        />
        <StatTile
          label="Total reward"
          value={rupiah(overview?.earnings_total ?? 0)}
          icon={Wallet}
          tone="primary"
        />
        <StatTile
          label="Klaim menunggu"
          value={rupiah(overview?.withdrawal_pending ?? 0)}
          hint={`${rupiah(overview?.withdrawal_paid ?? 0)} sudah dibayar`}
          icon={Wallet}
          tone="warning"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Kampanye berjalan"
          description="Kampanye dengan status berjalan beserta progresnya."
          bodyClassName="p-0"
        >
          {running.length === 0 ? (
            <EmptyState
              title="Tidak ada kampanye berjalan"
              description="Buat kampanye baru pada menu Kampanye untuk mulai mengirim."
            />
          ) : (
            <ul className="divide-y">
              {running.map((p) => {
                const total = Math.max(p.total_targets, 1);
                const progress = Math.round(((p.sent + p.failed) / total) * 100);
                return (
                  <li key={p.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{p.name}</p>
                      <Badge variant="outline" className="border-success/40 text-success">
                        Berjalan
                      </Badge>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {angka(p.sent)} terkirim · {angka(p.failed)} gagal · {angka(p.pending)} sisa ·
                      dibuat {waktu(p.created_at)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Pintasan" description="Buka halaman yang paling sering dipakai.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SHORTCUTS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
