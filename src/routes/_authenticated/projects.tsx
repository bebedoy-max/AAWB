import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, useIsAdmin } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createBlastProject,
  deleteBlastProject,
  listBlastProjects,
  setProjectStatus,
} from "@/lib/monitor.functions";
import { parsePhoneList } from "@/lib/phone-format";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Proyek Blast — AAWB" },
      { name: "description", content: "Buat proyek blast: pesan kampanye dan daftar nomor tujuan." },
      { property: "og:title", content: "Proyek Blast — AAWB" },
      { property: "og:description", content: "Buat proyek blast: pesan kampanye dan daftar nomor tujuan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const fetchProjects = useServerFn(listBlastProjects);
  const create = useServerFn(createBlastProject);
  const remove = useServerFn(deleteBlastProject);
  const setStatus = useServerFn(setProjectStatus);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [numbers, setNumbers] = useState("");

  const parsed = useMemo(() => parsePhoneList(numbers), [numbers]);

  const { data: projects } = useQuery({
    queryKey: ["blast-projects"],
    queryFn: () => fetchProjects(),
    refetchInterval: 8000,
    enabled: isAdmin,
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["blast-projects"] });

  const createProject = useMutation({
    mutationFn: () =>
      create({
        data: { name, message, phones: parsed.valid.map((p) => p.e164 as string) },
      }),
    onSuccess: (res) => {
      toast.success(`Proyek dibuat — ${res.queued} nomor siap dikerjakan Worker's`);
      setOpen(false);
      setName("");
      setMessage("");
      setNumbers("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeProject = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Proyek dihapus");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (vars: { id: string; status: "running" | "paused" }) => setStatus({ data: vars }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium">Akses ditolak</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Halaman Proyek Blast hanya untuk admin dan super admin.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Proyek Blast"
        description="Satu pesan + daftar nomor. Perangkat Worker's otomatis mengambil dan mengirimnya."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" /> Proyek baru
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {(projects ?? []).map((p) => {
          const done = p.sent + p.failed;
          const pct = p.total_targets ? Math.round((done / p.total_targets) * 100) : 0;
          return (
            <Card key={p.id}>
              <CardHeader className="flex-row items-start justify-between pb-2">
                <div className="min-w-0">
                  <CardTitle className="text-base break-words">{p.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.total_targets} nomor · dibuat {new Date(p.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
                <Badge variant={p.status === "running" ? "default" : "outline"}>
                  {p.status === "running" ? "Aktif" : p.status === "paused" ? "Dijeda" : p.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="mb-3 line-clamp-3 rounded-lg bg-accent/40 p-2 text-xs whitespace-pre-wrap">
                  {p.message_body}
                </p>
                <Progress value={pct} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.sent} terkirim · {p.failed} gagal · {p.pending} tersisa
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggleStatus.mutate({
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
                        <Play className="mr-1 size-3.5" /> Lanjutkan
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(`Hapus proyek "${p.name}" beserta antrean nomornya?`)) {
                        removeProject.mutate(p.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-1 size-3.5" /> Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {projects?.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Belum ada proyek blast — buat proyek pertama Anda.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Proyek blast baru</DialogTitle>
            <DialogDescription>
              Nomor otomatis diformat ke standar internasional — tidak perlu memilih kode negara.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pr-name">Nama proyek</Label>
              <Input
                id="pr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Promo September"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-msg">Pesan kampanye</Label>
              <Textarea
                id="pr-msg"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tulis pesan yang akan dikirim ke semua nomor…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-num">Nomor tujuan</Label>
              <Textarea
                id="pr-num"
                rows={7}
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder={"08123456789\n+60123456789\n+1 415 555 0132"}
              />
              <p className="text-xs text-muted-foreground">
                {parsed.valid.length} nomor valid
                {parsed.invalid.length ? ` · ${parsed.invalid.length} nomor tidak dikenali` : ""}
              </p>
              {parsed.valid.length ? (
                <div className="max-h-28 overflow-y-auto rounded-md border p-2 text-xs text-muted-foreground">
                  {parsed.valid.slice(0, 40).map((p) => (
                    <div key={p.e164}>
                      +{p.e164} {p.country ? `(${p.country})` : ""}
                    </div>
                  ))}
                  {parsed.valid.length > 40 ? <div>…</div> : null}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => createProject.mutate()}
              disabled={createProject.isPending || !message.trim() || parsed.valid.length === 0}
            >
              Buat & aktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
