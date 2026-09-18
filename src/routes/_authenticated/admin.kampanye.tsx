/** Kampanye pesan: buat proyek blast, pantau progres, jeda/lanjutkan/hapus. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pause, Play, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BulkPhoneImporter } from "@/components/bulk-phone-importer";
import {
  createBlastProject,
  deleteBlastProject,
  listBlastProjects,
  setProjectStatus,
} from "@/lib/monitor.functions";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  angka,
  waktu,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/kampanye")({
  component: KampanyePage,
});

const STATUS_STYLE: Record<string, string> = {
  running: "border-success/40 text-success",
  paused: "border-warning/40 text-warning",
  draft: "text-muted-foreground",
  completed: "border-info/40 text-info",
};

const STATUS_LABEL: Record<string, string> = {
  running: "Berjalan",
  paused: "Dijeda",
  draft: "Draf",
  completed: "Selesai",
};

function KampanyePage() {
  const queryClient = useQueryClient();
  const fetchProjects = useServerFn(listBlastProjects);
  const createProject = useServerFn(createBlastProject);
  const removeProject = useServerFn(deleteBlastProject);
  const changeStatus = useServerFn(setProjectStatus);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [phones, setPhones] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["blast-projects"],
    queryFn: () => fetchProjects(),
    refetchInterval: 20_000,
  });

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      campaigns: list.length,
      running: list.filter((p) => p.status === "running").length,
      sent: list.reduce((s, p) => s + p.sent, 0),
      pending: list.reduce((s, p) => s + p.pending, 0),
    };
  }, [data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["blast-projects"] });
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    queryClient.invalidateQueries({ queryKey: ["admin-targets"] });
  };

  const create = useMutation({
    mutationFn: () => createProject({ data: { name, message, phones } }),
    onSuccess: (res) => {
      toast.success(`Kampanye dibuat — ${angka(res.queued)} nomor masuk antrean`);
      setOpen(false);
      setName("");
      setMessage("");
      setPhones([]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; status: "running" | "paused" }) =>
      changeStatus({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const destroy = useMutation({
    mutationFn: (id: string) => removeProject({ data: { id } }),
    onSuccess: () => {
      toast.success("Kampanye dihapus");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AdminPageTitle
        title="Kampanye Pesan"
        description="Satu kampanye berisi pesan dan kolam nomor yang dikerjakan perangkat member."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 size-4" />
                  Kampanye baru
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Buat kampanye baru</DialogTitle>
                  <DialogDescription>
                    Nomor diformat otomatis ke format internasional saat diimpor.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-name">Nama kampanye</Label>
                    <Input
                      id="c-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Promo Akhir Bulan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-msg">Isi pesan</Label>
                    <Textarea
                      id="c-msg"
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tulis pesan yang akan dikirim ke semua nomor."
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BulkPhoneImporter
                      existingPhones={phones}
                      onImport={(rows) =>
                        setPhones((prev) =>
                          Array.from(new Set([...prev, ...rows.map((r) => r.phone)])),
                        )
                      }
                    />
                    <Badge variant="outline">{angka(phones.length)} nomor siap</Badge>
                    {phones.length ? (
                      <Button variant="ghost" size="sm" onClick={() => setPhones([])}>
                        Kosongkan
                      </Button>
                    ) : null}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Batal
                  </Button>
                  <Button
                    disabled={create.isPending || !message.trim() || !phones.length}
                    onClick={() => create.mutate()}
                  >
                    {create.isPending ? "Menyimpan…" : "Buat kampanye"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total kampanye" value={angka(totals.campaigns)} icon={Send} tone="info" />
        <StatTile label="Sedang berjalan" value={angka(totals.running)} icon={Play} tone="success" />
        <StatTile label="Pesan terkirim" value={angka(totals.sent)} icon={Send} tone="primary" />
        <StatTile label="Sisa antrean" value={angka(totals.pending)} icon={Pause} tone="warning" />
      </div>

      <Panel className="mt-4" title="Daftar kampanye" bodyClassName="p-0">
        {error ? (
          <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="Belum ada kampanye"
            description="Buat kampanye baru untuk mulai mendistribusikan pesan ke perangkat member."
          />
        ) : (
          <ul className="divide-y">
            {(data ?? []).map((p) => {
              const total = Math.max(p.total_targets, 1);
              const progress = Math.round(((p.sent + p.failed) / total) * 100);
              return (
                <li key={p.id} className="px-4 py-4 sm:px-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <Badge
                          variant="outline"
                          className={STATUS_STYLE[p.status] ?? "text-muted-foreground"}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {p.message_body || "(tanpa pesan)"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({
                            id: p.id,
                            status: p.status === "running" ? "paused" : "running",
                          })
                        }
                      >
                        {p.status === "running" ? (
                          <>
                            <Pause className="mr-1 size-3.5" /> Jeda
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 size-3.5" /> Jalankan
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {angka(p.sent)} terkirim · {angka(p.failed)} gagal · {angka(p.pending)} sisa ·
                    total {angka(p.total_targets)} · dibuat {waktu(p.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kampanye ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Kampanye {deleteTarget?.name} dan seluruh antrean nomornya akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && destroy.mutate(deleteTarget.id)}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
