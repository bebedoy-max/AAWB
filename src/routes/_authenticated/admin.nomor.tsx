/** Pool target pengiriman: ringkasan nomor, input massal, dan tabel target. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMyRole } from "./admin";
import { CheckCircle2, ListChecks, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkPhoneImporter } from "@/components/bulk-phone-importer";
import { parsePhoneList } from "@/lib/whatsapp";
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
import {
  addTargets,
  deleteTarget,
  listCampaignOptions,
  listTargets,
  resetTargets,
} from "@/lib/admin-console.functions";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  TableShell,
  Td,
  Th,
  angka,
  waktu,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/nomor")({
  component: NomorPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Siap",
  processing: "Diproses",
  sent: "Terkirim",
  failed: "Gagal",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-warning/40 text-warning",
  processing: "border-info/40 text-info",
  sent: "border-success/40 text-success",
  failed: "border-destructive/40 text-destructive",
};

function NomorPage() {
  const isSuper = Boolean(useMyRole().data?.is_super_admin);
  const queryClient = useQueryClient();
  const fetchOptions = useServerFn(listCampaignOptions);
  const fetchTargets = useServerFn(listTargets);
  const pushTargets = useServerFn(addTargets);
  const removeTarget = useServerFn(deleteTarget);
  const wipeTargets = useServerFn(resetTargets);

  const [campaignId, setCampaignId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [targetCampaign, setTargetCampaign] = useState("");
  const [raw, setRaw] = useState("");
  const [imported, setImported] = useState<string[]>([]);

  const { data: campaigns } = useQuery({
    queryKey: ["admin-campaign-options"],
    queryFn: () => fetchOptions(),
  });

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-targets", campaignId, status, page],
    queryFn: () => fetchTargets({ data: { campaignId, status, page } }),
  });

  const pageCount = Math.max(1, Math.ceil((data?.filtered ?? 0) / (data?.pageSize ?? 20)));
  const changeFilters = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const parsed = parsePhoneList(raw, "62").map((r) => r.phone);
  const pending = Array.from(new Set([...parsed, ...imported]));

  const add = useMutation({
    mutationFn: () => pushTargets({ data: { campaignId: targetCampaign, phones: pending } }),
    onSuccess: (res) => {
      if (!res.added) {
        toast.info(`Semua nomor (${angka(res.skipped)}) sudah ada pada kampanye ini.`);
      } else {
        toast.success(
          `${angka(res.added)} nomor ditambahkan${res.skipped ? `, ${angka(res.skipped)} duplikat dilewati` : ""}`,
        );
      }
      setRaw("");
      setImported([]);
      queryClient.invalidateQueries({ queryKey: ["admin-targets"] });
      queryClient.invalidateQueries({ queryKey: ["blast-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => wipeTargets(),
    onSuccess: (res) => {
      toast.success(`${angka(res.removed)} nomor dihapus`);
      queryClient.invalidateQueries({ queryKey: ["admin-targets"] });
      queryClient.invalidateQueries({ queryKey: ["blast-projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const destroy = useMutation({
    mutationFn: (id: string) => removeTarget({ data: { id } }),
    onSuccess: () => {
      toast.success("Nomor dihapus dari antrean");
      queryClient.invalidateQueries({ queryKey: ["admin-targets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AdminPageTitle
        title="Pool Target Pengiriman"
        description="Kelola nomor tujuan pada setiap kampanye. Nomor otomatis diformat internasional."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            {isSuper ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={reset.isPending}>
                  <Trash2 className="mr-2 size-4" />
                  {reset.isPending ? "Menghapus…" : "Reset"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus semua nomor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Seluruh nomor tujuan pada semua kampanye akan dihapus permanen, termasuk yang
                    sudah terkirim. Pesan dan kampanye tetap ada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={() => reset.mutate()}>Hapus semua</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total target" value={angka(data?.total ?? 0)} icon={ListChecks} tone="info" />
        <StatTile label="Siap kirim" value={angka(data?.ready ?? 0)} icon={ListChecks} tone="warning" />
        <StatTile label="Berhasil" value={angka(data?.sent ?? 0)} icon={CheckCircle2} tone="success" />
        <StatTile label="Gagal" value={angka(data?.failed ?? 0)} icon={XCircle} tone="danger" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Tambah nomor" description="Tempel daftar nomor atau impor dari berkas.">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kampanye tujuan</Label>
              <Select value={targetCampaign} onValueChange={setTargetCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kampanye" />
                </SelectTrigger>
                <SelectContent>
                  {(campaigns ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="raw">Daftar nomor</Label>
              <Textarea
                id="raw"
                rows={7}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"08123456789\n+628123456789\n628123456789"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BulkPhoneImporter
                existingPhones={pending}
                onImport={(rows) =>
                  setImported((prev) =>
                    Array.from(new Set([...prev, ...rows.map((r) => r.phone)])),
                  )
                }
              />
              <Badge variant="outline">{angka(pending.length)} nomor valid</Badge>
            </div>

            <Button
              className="w-full"
              disabled={add.isPending || !targetCampaign || !pending.length}
              onClick={() => add.mutate()}
            >
              <Plus className="mr-2 size-4" />
              {add.isPending ? "Menyimpan…" : "Tambahkan ke kampanye"}
            </Button>
            {!campaigns?.length ? (
              <p className="text-xs text-muted-foreground">
                Belum ada kampanye. Buat kampanye terlebih dahulu pada menu Kampanye.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Daftar target"
          description={
            data?.filtered
              ? `${angka(data.filtered)} nomor · 20 per halaman`
              : "Menampilkan seluruh data target."
          }
          bodyClassName="p-0"
          action={
            <div className="flex flex-wrap gap-2">
              <Select value={campaignId} onValueChange={(v) => changeFilters(() => setCampaignId(v))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua kampanye</SelectItem>
                  {(campaigns ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => changeFilters(() => setStatus(v))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="ready">Siap</SelectItem>
                  <SelectItem value="sent">Terkirim</SelectItem>
                  <SelectItem value="failed">Gagal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        >
          {error ? (
            <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
          ) : isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
          ) : (data?.rows ?? []).length === 0 ? (
            <EmptyState
              title="Belum ada nomor"
              description="Tambahkan nomor pada panel di samping untuk mengisi kolam target."
            />
          ) : (
            <>
              <TableShell>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <Th>Nomor</Th>
                    <Th>Kampanye</Th>
                    <Th>Status</Th>
                    <Th>Diambil</Th>
                    <Th>Waktu</Th>
                    <Th className="text-right">Aksi</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <Td className="font-medium">+{r.recipient_phone}</Td>
                      <Td className="text-muted-foreground">{r.campaign_name}</Td>
                      <Td>
                        <Badge
                          variant="outline"
                          className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </Td>
                      <Td className="text-muted-foreground">{r.claimed ? "Ya" : "Belum"}</Td>
                      <Td className="text-muted-foreground">{waktu(r.sent_at ?? r.created_at)}</Td>
                      <Td className="text-right">
                        {isSuper ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => destroy.mutate(r.id)}
                          disabled={destroy.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Halaman {angka(data?.page ?? 1)} dari {angka(pageCount)}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pageCount || isFetching}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
