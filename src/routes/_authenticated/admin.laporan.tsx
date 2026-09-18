/** Laporan pengiriman: filter kampanye, ringkasan, tabel riwayat, dan unduh CSV. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Clock, Download, RefreshCw, Search, XCircle } from "lucide-react";
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
import { listCampaignOptions, listReport } from "@/lib/admin-console.functions";
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

function LaporanPage() {
  const fetchOptions = useServerFn(listCampaignOptions);
  const fetchReport = useServerFn(listReport);

  const [campaignId, setCampaignId] = useState("all");
  const [q, setQ] = useState("");

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

  const download = () => {
    if (!rows.length) {
      toast.error("Tidak ada data untuk diunduh.");
      return;
    }
    const header = ["Waktu", "Pengirim", "Pemilik perangkat", "Nomor tujuan", "Status", "Pesan", "Keterangan"];
    const body = rows.map((r) =>
      [
        waktu(r.sent_at ?? r.created_at),
        r.sender,
        r.sender_owner,
        `+${r.recipient_phone}`,
        STATUS_LABEL[r.status] ?? r.status,
        r.message_body,
        r.error_log ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = `\uFEFF${[header.map(csvCell).join(","), ...body].join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-pengiriman-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Laporan diunduh");
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
            <Button size="sm" onClick={download}>
              <Download className="mr-2 size-4" />
              Unduh CSV
            </Button>
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
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={campaignId} onValueChange={setCampaignId}>
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
                onChange={(e) => setQ(e.target.value)}
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
          <TableShell>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Waktu</Th>
                <Th>Pengirim</Th>
                <Th>Nomor tujuan</Th>
                <Th>Status</Th>
                <Th>Keterangan</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {waktu(r.sent_at ?? r.created_at)}
                  </Td>
                  <Td>
                    <p className="font-medium">{r.sender}</p>
                    <p className="text-xs text-muted-foreground">{r.sender_owner}</p>
                  </Td>
                  <Td className="font-medium">+{r.recipient_phone}</Td>
                  <Td>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLE[r.status] ?? "text-muted-foreground"}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </Td>
                  <Td className="max-w-xs">
                    <p className="truncate text-xs text-muted-foreground">
                      {r.error_log || r.message_body || "—"}
                    </p>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </>
  );
}
