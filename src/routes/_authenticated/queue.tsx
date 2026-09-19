import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhoneDisplay } from "@/lib/whatsapp";
import type { Campaign, QueuedMessage } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/queue")({
  head: () => ({
    meta: [
      { title: "Antrean & Log Audit — NAROWA" },
      { name: "description", content: "Pantau status dan riwayat pengiriman pesan WhatsApp." },
      { property: "og:title", content: "Antrean & Log Audit — NAROWA" },
      { property: "og:description", content: "Pantau status dan riwayat pengiriman pesan WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Queue,
});

const fmt = (value: string | null) => (value ? new Date(value).toLocaleString("id-ID") : "—");

function Queue() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [search, setSearch] = useState("");

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Campaign[];
    },
  });

  const { data: rows } = useQuery({
    queryKey: ["queue"],
    refetchInterval: 6000,
    queryFn: async () => {
      const { data } = await supabase
        .from("message_queue")
        .select("*")
        .order("scheduled_at", { ascending: false })
        .limit(500);
      return (data ?? []) as QueuedMessage[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_queue" }, () =>
        queryClient.invalidateQueries({ queryKey: ["queue"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (campaign === "all" || r.campaign_id === campaign) &&
        (!q || r.recipient_phone.includes(q.replace(/\D/g, "")) ||
          r.message_body.toLowerCase().includes(q)),
    );
  }, [rows, status, campaign, search]);

  return (
    <>
      <PageHeader
        title="Antrean & Log Audit"
        description="Lihat semua pesan dalam antrean, terkirim, atau gagal beserta penyebabnya."
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 flex-1 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari penerima atau isi pesan"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="pending">Dalam antrean</SelectItem>
                <SelectItem value="processing">Diproses</SelectItem>
                <SelectItem value="sent">Terkirim</SelectItem>
                <SelectItem value="failed">Gagal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campaign} onValueChange={setCampaign}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Semua kampanye" />
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
          </div>

          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Penerima</TableHead>
                  <TableHead>Isi pesan</TableHead>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Terkirim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kesalahan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {formatPhoneDisplay(r.recipient_phone)}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {r.message_body}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmt(r.scheduled_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(r.sent_at)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status === "pending" ? "queued" : r.status} />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                      {r.error_log ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Belum ada pesan dalam antrean.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
