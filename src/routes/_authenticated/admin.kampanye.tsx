/** Kampanye (kolam admin): buat, ubah, jalankan, dan pantau proyek blast. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Pause, Pencil, Play, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { CampaignComposer, clearCampaignDraft, type CampaignDraft } from "@/components/campaign-composer";
import { BulkPhoneImporter } from "@/components/bulk-phone-importer";
import { AdminPageTitle, EmptyState, Panel, StatTile, angka, waktu } from "@/components/admin-ui";
import {
  createBlastProject,
  deleteBlastProject,
  listBlastProjects,
  setCampaignTestMode,
  setProjectStatus,
  updateBlastProject,
  type BlastProjectRow,
} from "@/lib/monitor.functions";

export const Route = createFileRoute("/_authenticated/admin/kampanye")({
  head: () => ({
    meta: [
      { title: "Kampanye — NAROWA" },
      { name: "description", content: "Buat dan kelola kampanye blast NAROWA beserta nomor tujuannya." },
      { property: "og:title", content: "Kampanye — NAROWA" },
      { property: "og:description", content: "Buat dan kelola kampanye blast NAROWA beserta nomor tujuannya." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KampanyePage,
});

const STATUS_STYLE: Record<string, string> = {
  running: "border-success/40 text-success",
  paused: "border-warning/40 text-warning",
  completed: "border-info/40 text-info",
  draft: "border-muted-foreground/40 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  running: "Berjalan",
  paused: "Dijeda",
  completed: "Selesai",
  draft: "Draf",
};

function KampanyePage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlastProjectRow | null>(null);
  const [phones, setPhones] = useState<string[]>([]);

  const fetchProjects = useServerFn(listBlastProjects);
  const create = useServerFn(createBlastProject);
  const update = useServerFn(updateBlastProject);
  const remove = useServerFn(deleteBlastProject);
  const setStatus = useServerFn(setProjectStatus);
  const setTestMode = useServerFn(setCampaignTestMode);

  const { data: projects } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => fetchProjects(),
    refetchInterval: 8000,
  });

  const rows = useMemo(() => projects ?? [], [projects]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, p) => ({
          targets: acc.targets + (p.total_targets ?? 0),
          sent: acc.sent + p.sent,
          failed: acc.failed + p.failed,
          pending: acc.pending + p.pending,
        }),
        { targets: 0, sent: 0, failed: 0, pending: 0 },
      ),
    [rows],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });

  const saveMutation = useMutation({
    mutationFn: async (draft: CampaignDraft) => {
      if (editing) {
        return update({
          data: {
            id: editing.id,
            name: draft.name,
            message: draft.message,
            mediaUrl: draft.mediaUrl,
            ctaText: draft.ctaText,
            ctaUrl: draft.ctaUrl,
          },
        });
      }
      return create({
        data: {
          name: draft.name,
          message: draft.message,
          phones,
          mediaUrl: draft.mediaUrl,
          ctaText: draft.ctaText,
          ctaUrl: draft.ctaUrl,
        },
      });
    },
    onSuccess: () => {
      if (!editing) clearCampaignDraft();
      toast.success(editing ? "Kampanye diperbarui" : "Kampanye dibuat");
      setOpen(false);
      setEditing(null);
      setPhones([]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "running" | "paused" }) => setStatus({ data: vars }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (vars: { id: string; testMode: boolean }) => setTestMode({ data: vars }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Kampanye dihapus");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AdminPageTitle
        title="Kampanye"
        description="Rancang pesan blast, tambahkan nomor tujuan, lalu jalankan atau jeda kapan saja."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setPhones([]);
              setOpen(true);
            }}
          >
            <Plus className="mr-1 size-4" /> Kampanye baru
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Kampanye" value={angka(rows.length)} icon={Megaphone} />
        <StatTile label="Total nomor" value={angka(totals.targets)} icon={Send} tone="info" />
        <StatTile label="Terkirim" value={angka(totals.sent)} tone="success" />
        <StatTile label="Menunggu" value={angka(totals.pending)} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((p) => {
          const done = p.sent + p.failed;
          const pct = p.total_targets ? Math.round((done / p.total_targets) * 100) : 0;
          return (
            <Panel
              key={p.id}
              title={p.name}
              description={`${angka(p.total_targets)} nomor · dibuat ${waktu(p.created_at)}`}
              action={
                <Badge variant="outline" className={STATUS_STYLE[p.status] ?? ""}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </Badge>
              }
            >
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {p.message_body}
              </p>

              <Progress value={pct} className="mt-4 h-2" />
              <p className="mt-2 text-xs text-muted-foreground">
                {angka(p.sent)} terkirim · {angka(p.failed)} gagal · {angka(p.pending)} tersisa
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {p.status === "running" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMutation.mutate({ id: p.id, status: "paused" })}
                  >
                    <Pause className="mr-1 size-3.5" /> Jeda
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={p.status === "completed"}
                    onClick={() => statusMutation.mutate({ id: p.id, status: "running" })}
                  >
                    <Play className="mr-1 size-3.5" /> Jalankan
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(p);
                    setPhones([]);
                    setOpen(true);
                  }}
                >
                  <Pencil className="mr-1 size-3.5" /> Ubah
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="mr-1 size-3.5" /> Hapus
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Hapus kampanye "{p.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Seluruh nomor dan antrean pesan kampanye ini ikut terhapus permanen.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate(p.id)}>
                        Hapus
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="ml-auto flex items-center gap-2">
                  <Label htmlFor={`test-${p.id}`} className="text-xs text-muted-foreground">
                    Mode uji
                  </Label>
                  <Switch
                    id={`test-${p.id}`}
                    checked={p.test_mode}
                    onCheckedChange={(checked) =>
                      testMutation.mutate({ id: p.id, testMode: checked })
                    }
                  />
                </div>
              </div>
            </Panel>
          );
        })}

        {rows.length === 0 ? (
          <Panel className="lg:col-span-2">
            <EmptyState
              title="Belum ada kampanye"
              description="Buat kampanye pertama: tulis pesan, tambahkan nomor tujuan, lalu jalankan."
            />
          </Panel>
        ) : null}
      </div>

      <CampaignComposer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        isPending={saveMutation.isPending}
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
        onSubmit={(draft) => saveMutation.mutate(draft)}
        extra={
          editing ? null : (
            <div className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Nomor tujuan</p>
                  <p className="text-xs text-muted-foreground">
                    {phones.length ? `${angka(phones.length)} nomor siap dikirim` : "Belum ada nomor"}
                  </p>
                </div>
                <BulkPhoneImporter
                  existingPhones={phones}
                  onImport={(imported) =>
                    setPhones((prev) =>
                      Array.from(new Set([...prev, ...imported.map((row) => row.phone)])),
                    )
                  }
                />
              </div>
            </div>
          )
        }
      />
    </>
  );
}
