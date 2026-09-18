/** Kampanye pesan: buat proyek blast, pantau progres, jeda/lanjutkan/hapus. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calendar, Link2, Pause, Pencil, Play, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { CampaignComposer, type CampaignDraft } from "@/components/campaign-composer";
import {
  createBlastProject,
  deleteBlastProject,
  listBlastProjects,
  setProjectStatus,
  updateBlastProject,
  type BlastProjectRow,
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
  const updateProject = useServerFn(updateBlastProject);
  const removeProject = useServerFn(deleteBlastProject);
  const changeStatus = useServerFn(setProjectStatus);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlastProjectRow | null>(null);
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
    mutationFn: (draft: CampaignDraft) =>
      createProject({
        data: {
          name: draft.name,
          message: draft.message,
          phones: [],
          mediaUrl: draft.mediaUrl,
          ctaText: draft.ctaText,
          ctaUrl: draft.ctaUrl,
        },
      }),
    onSuccess: (res) => {
      toast.success(res.queued ? `Kampanye diluncurkan — ${angka(res.queued)} nomor masuk antrean` : "Kampanye dibuat sebagai draf — tambahkan nomor di menu Data Nomor.");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; draft: CampaignDraft }) =>
      updateProject({
        data: {
          id: vars.id,
          name: vars.draft.name,
          message: vars.draft.message,
          mediaUrl: vars.draft.mediaUrl,
          ctaText: vars.draft.ctaText,
          ctaUrl: vars.draft.ctaUrl,
        },
      }),
    onSuccess: () => {
      toast.success("Kampanye diperbarui");
      setEditing(null);
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
        description="Satu kampanye berisi pesan dan kolam nomor yang dikerjakan perangkat Worker's."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 size-4" />
              Tambah kampanye baru
            </Button>
          </>
        }
      />

      <CampaignComposer
        open={open}
        onOpenChange={setOpen}
        isPending={create.isPending}
        onSubmit={(draft) => create.mutate(draft)}
      />

      <CampaignComposer
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        isPending={update.isPending}
        initial={
          editing
            ? {
                name: editing.name,
                message: editing.message_body,
                mediaUrl: editing.media_url,
                ctaText: editing.cta_text ?? "",
                ctaUrl: editing.cta_url ?? "",
              }
            : null
        }
        onSubmit={(draft) => editing && update.mutate({ id: editing.id, draft })}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total kampanye" value={angka(totals.campaigns)} icon={Send} tone="info" />
        <StatTile label="Sedang berjalan" value={angka(totals.running)} icon={Play} tone="success" />
        <StatTile label="Pesan terkirim" value={angka(totals.sent)} icon={Send} tone="primary" />
        <StatTile label="Sisa antrean" value={angka(totals.pending)} icon={Pause} tone="warning" />
      </div>

      <div className="mt-4">
        {error ? (
          <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : (data ?? []).length === 0 ? (
          <Panel bodyClassName="p-0">
            <EmptyState
              title="Belum ada kampanye"
              description="Buat kampanye baru untuk mulai mendistribusikan pesan ke perangkat Worker's."
            />
          </Panel>
        ) : (
          <ul className="space-y-3">
            {(data ?? []).map((p) => {
              const total = Math.max(p.total_targets, 1);
              const progress = Math.round(((p.sent + p.failed) / total) * 100);
              const running = p.status === "running";
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  {/* Poster */}
                  <div className="grid h-24 w-full shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted sm:h-20 sm:w-32">
                    {p.media_url ? (
                      <img src={p.media_url} alt={p.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground">
                        <Send className="size-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-base font-bold tracking-tight">{p.name}</p>
                      <Badge
                        variant="outline"
                        className={`shrink-0 uppercase ${STATUS_STYLE[p.status] ?? "text-muted-foreground"}`}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {p.message_body || "(tanpa pesan)"}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {p.cta_text ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                          <Link2 className="size-3" />
                          {p.cta_text}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        {waktu(p.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {angka(p.sent)} terkirim · {angka(p.failed)} gagal · {angka(p.pending)} sisa
                        · {progress}%
                      </span>
                    </div>
                  </div>

                  {/* Aksi */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-destructive"
                      onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                    >
                      <Trash2 className="mr-1.5 size-3.5" />
                      Hapus
                    </Button>
                  </div>

                  {/* Power switch */}
                  <div className="flex shrink-0 flex-col items-center gap-2 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Power Switch
                    </span>
                    <Switch
                      checked={running}
                      disabled={toggle.isPending}
                      onCheckedChange={(on) =>
                        toggle.mutate({ id: p.id, status: on ? "running" : "paused" })
                      }
                      aria-label={`Aktifkan kampanye ${p.name}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
