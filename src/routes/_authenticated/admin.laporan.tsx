/** Laporan pengiriman: filter kampanye, ringkasan, tabel riwayat, dan unduh CSV. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Clock, Download, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  clearReportHistory,
  listCampaignOptions,
  listReport,
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

export const Route = createFileRoute("/_authenticated/admin/laporan")({
  component: LaporanPage,
});

type ReportRow = {
  id: string;
  sent_at: string | null;
  created_at: string;
  sender: string;
  sender_owner: string;
  recipient_phone: string;
  status: string;
  message_body: string;
  error_log: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  processing: "Diproses",
  sent: "Berhasil",
  failed: "Gagal",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-warning/40 text-warning",
  processing: "border-info/40 text-info",
  sent: "border-success/40 text-success",
  failed: "border-destructive/40 text-destructive",
};

function csvCell(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

const PAGE_SIZE = 20;

function LaporanPage() {
  const fetchOptions = useServerFn(listCampaignOptions);
  const fetchReport = useServerFn(listReport);
  const clearHistory = useServerFn(clearReportHistory);

  const [campaignId, setCampaignId] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ReportRow | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { data: campaigns } = useQuery({
    queryKey: ["admin-campaign-options"],
    queryFn: () => fetchOptions(),
  });

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-report", campaignId],
    queryFn: () => fetchReport({ data: { campaignId } }),
  });

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) =>
      [r.recipient_phone, r.sender, r.sender_owner, r.message_body, r.error_log]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [rows, currentPage],
  );

  const HEADER = [
    "Waktu",
    "Pengirim",
    "Pemilik perangkat",
    "Nomor tujuan",
    "Status",
    "Pesan",
    "Keterangan",
  ];

  const tableRows = () =>
    rows.map((r) => [
      waktu(r.sent_at ?? r.created_at),
      r.sender,
      r.sender_owner,
      `+${r.recipient_phone}`,
      STATUS_LABEL[r.status] ?? r.status,
      r.message_body,
      r.error_log ?? "",
    ]);

  const saveFile = (content: string, mime: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-pengiriman-${new Date().toISOString().slice(0, 10)}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Laporan diunduh");
  };

  const esc = (v: string) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const htmlTable = () =>
    `<table border="1"><thead><tr>${HEADER.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${tableRows()
      .map((cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;

  const download = (format: "csv" | "excel" | "pdf") => {
    if (!rows.length) {
      toast.error("Tidak ada data untuk diunduh.");
      return;
    }

    if (format === "csv") {
      const body = tableRows().map((cells) => cells.map(csvCell).join(","));
      saveFile(
        `\uFEFF${[HEADER.map(csvCell).join(","), ...body].join("\n")}`,
        "text/csv;charset=utf-8",
        "csv",
      );
      return;
    }

    if (format === "excel") {
      saveFile(
        `\uFEFF<html><head><meta charset="utf-8" /></head><body>${htmlTable()}</body></html>`,
        "application/vnd.ms-excel;charset=utf-8",
        "xls",
      );
      return;
    }

    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Izinkan pop-up untuk menyimpan laporan PDF.");
      return;
    }
    win.document.write(
      `<html><head><meta charset="utf-8" /><title>Laporan Pengiriman</title>` +
        `<style>body{font-family:system-ui,sans-serif;padding:24px}h1{font-size:18px}` +
        `table{border-collapse:collapse;width:100%;font-size:11px}` +
        `th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}` +
        `th{background:#eee}</style></head><body>` +
        `<h1>Laporan Pengiriman</h1><p>${esc(waktu(new Date().toISOString()))} · ${rows.length} baris</p>` +
        `${htmlTable()}</body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearHistory();
      toast.success("Riwayat pengiriman dihapus");
      setConfirmClear(false);
      setDetail(null);
      setPage(1);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <AdminPageTitle
        title="Laporan Pengiriman"
        description="Riwayat 1.000 pengiriman terbaru beserta status dan penyebab kegagalan."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="mr-2 size-4" />
              Bersihkan riwayat
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Download className="mr-2 size-4" />
                  Unduh laporan
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => download("pdf")}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => download("excel")}>Excel (.xls)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => download("csv")}>CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Berhasil" value={angka(data?.sent ?? 0)} icon={CheckCircle2} tone="success" />
        <StatTile label="Gagal" value={angka(data?.failed ?? 0)} icon={XCircle} tone="danger" />
        <StatTile label="Menunggu" value={angka(data?.ready ?? 0)} icon={Clock} tone="warning" />
      </div>

      <Panel
        className="mt-4"
        title="Riwayat pengiriman"
        description="Klik baris untuk melihat detail lengkap pengiriman."
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              value={campaignId}
              onValueChange={(v) => {
                setCampaignId(v);
                setPage(1);
              }}
            >
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
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari nomor atau pesan"
                className="pl-8"
              />
            </div>
          </div>
        }
      >
        {error ? (
          <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada riwayat"
            description="Laporan terisi setelah kampanye mulai mengirim pesan."
          />
        ) : (
          <TableShell className="min-w-0 lg:min-w-[640px]">
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Waktu</Th>
                <Th>Pengirim</Th>
                <Th className="hidden lg:table-cell">Nomor tujuan</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Keterangan</Th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  onClick={() => setDetail(r)}
                >
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {waktu(r.sent_at ?? r.created_at)}
                  </Td>
                  <Td>
                    <p className="font-medium">{r.sender}</p>
                    <p className="text-xs text-muted-foreground">{r.sender_owner}</p>
                  </Td>
                  <Td className="hidden font-medium lg:table-cell">+{r.recipient_phone}</Td>
                  <Td>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </Td>
                  <Td className="hidden max-w-xs lg:table-cell">
                    <p className="truncate text-xs text-muted-foreground">
                      {r.error_log || r.message_body || "—"}
                    </p>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm">
            <p className="text-xs text-muted-foreground">
              Halaman {currentPage} dari {totalPages} · {angka(rows.length)} baris
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detail pengiriman</DialogTitle>
            <DialogDescription>Informasi lengkap satu riwayat pengiriman.</DialogDescription>
          </DialogHeader>
          {detail ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Waktu</dt>
                <dd className="font-medium">{waktu(detail.sent_at ?? detail.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    variant="outline"
                    className={STATUS_STYLE[detail.status] ?? "text-muted-foreground"}
                  >
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pengirim</dt>
                <dd className="font-medium">{detail.sender}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pemilik perangkat</dt>
                <dd className="font-medium">{detail.sender_owner}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Nomor tujuan</dt>
                <dd className="font-medium">+{detail.recipient_phone}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Pesan</dt>
                <dd className="whitespace-pre-wrap break-words rounded-lg bg-muted p-2.5 text-xs">
                  {detail.message_body || "—"}
                </dd>
              </div>
              {detail.error_log ? (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Keterangan</dt>
                  <dd className="whitespace-pre-wrap break-words rounded-lg bg-muted p-2.5 text-xs text-destructive">
                    {detail.error_log}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={(o) => !clearing && setConfirmClear(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Bersihkan riwayat?</DialogTitle>
            <DialogDescription>
              Riwayat terkirim dan gagal akan dihapus permanen, termasuk antrean menunggu dari
              kampanye yang sudah tidak berjalan. Antrean kampanye yang sedang berjalan tetap aman.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)} disabled={clearing}>
              Batal
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClear} disabled={clearing}>
              <Trash2 className="mr-2 size-4" />
              {clearing ? "Menghapus…" : "Ya, hapus semua"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
