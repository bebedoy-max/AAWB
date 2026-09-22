/** Laporan keuangan: rekap pendapatan, pencairan, tren harian, dan peringkat worker. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BarChart3,
  Coins,
  Download,
  RefreshCw,
  Search,
  Trophy,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFinanceReport } from "@/lib/finance.functions";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  TableShell,
  Td,
  Th,
  angka,
  rupiah,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/keuangan")({
  head: () => ({
    meta: [
      { title: "Laporan Keuangan — NAROWA" },
      {
        name: "description",
        content: "Rekap pendapatan, pencairan dana, dan peringkat worker NAROWA.",
      },
      { property: "og:title", content: "Laporan Keuangan — NAROWA" },
      {
        property: "og:description",
        content: "Rekap pendapatan, pencairan dana, dan peringkat worker NAROWA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KeuanganPage,
});

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeFor(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  if (preset === "week") {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: iso(start), to };
  }
  if (preset === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: iso(start), to };
  }
  if (preset === "prev_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: iso(start), to: iso(end) };
  }
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: iso(start), to };
}

const PRESETS = [
  { value: "week", label: "7 hari" },
  { value: "month", label: "Bulan ini" },
  { value: "prev_month", label: "Bulan lalu" },
  { value: "custom", label: "Custom" },
] as const;

const MEDALS = ["🥇", "🥈", "🥉"];
const WORKER_PER_PAGE = 20;

function tanggal(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function KeuanganPage() {
  const fetchReport = useServerFn(getFinanceReport);
  const [preset, setPreset] = useState<string>("month");
  const initial = rangeFor("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [cari, setCari] = useState("");
  const [workerPageRaw, setWorkerPage] = useState(0);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["finance-report", from, to],
    queryFn: () => fetchReport({ data: { from, to } }),
  });

  function pilihPreset(value: string) {
    setPreset(value);
    setWorkerPage(0);
    if (value === "custom") return;
    const r = rangeFor(value);
    setFrom(r.from);
    setTo(r.to);
  }

  const filteredWorkers = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const list = data?.workers ?? [];
    if (!q) return list;
    return list.filter(
      (w) => w.name.toLowerCase().includes(q) || w.email.toLowerCase().includes(q),
    );
  }, [data, cari]);

  const workerTotal = filteredWorkers.length;
  const workerTotalPages = Math.max(1, Math.ceil(workerTotal / WORKER_PER_PAGE));
  const workerPage = Math.min(workerPageRaw, workerTotalPages - 1);
  const workerRows = filteredWorkers.slice(
    workerPage * WORKER_PER_PAGE,
    (workerPage + 1) * WORKER_PER_PAGE,
  );

  const maxSeries = useMemo(() => {
    const list = data?.series ?? [];
    return Math.max(1, ...list.map((d) => d.earned));
  }, [data]);

  function unduhCsv() {
    const list = data?.workers ?? [];
    if (!list.length) {
      toast.error("Belum ada data untuk diunduh");
      return;
    }
    const head = [
      "Peringkat",
      "Nama",
      "Email",
      "Pesan terkirim",
      "Pendapatan pesan",
      "Bonus referal",
      "Penyesuaian",
      "Total pendapatan",
      "Dicairkan",
      "Menunggu",
      "Saldo berjalan",
    ];
    const body = list.map((w, i) => [
      i + 1,
      w.name,
      w.email,
      w.messages,
      w.from_messages,
      w.from_referral,
      w.from_adjustment,
      w.earned,
      w.paid,
      w.pending,
      w.balance_all_time,
    ]);
    const csv = [head, ...body]
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-keuangan-${from}-sd-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Laporan keuangan diunduh");
  }

  const s = data?.summary;

  return (
    <>
      <AdminPageTitle
        title="Laporan Keuangan"
        description="Rekap dana per periode, detail per worker, dan bahan audit pembanding pembayaran agen."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            <Button size="sm" onClick={unduhCsv}>
              <Download className="mr-2 size-4" />
              Unduh
            </Button>
          </div>
        }
      />

      <Panel className="mt-1" title="Periode">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={preset} onValueChange={pilihPreset}>
            <TabsList>
              {PRESETS.map((p) => (
                <TabsTrigger key={p.value} value={p.value} className="text-xs sm:text-sm">
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={from}
              className="w-[10.5rem]"
              onChange={(e) => {
                setPreset("custom");
                setFrom(e.target.value);
              }}
            />
            <span className="text-muted-foreground text-sm">s/d</span>
            <Input
              type="date"
              value={to}
              className="w-[10.5rem]"
              onChange={(e) => {
                setPreset("custom");
                setTo(e.target.value);
              }}
            />
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total pendapatan periode"
          value={rupiah(s?.earned ?? 0)}
          hint={`${angka(s?.messages ?? 0)} pesan terkirim`}
          icon={Coins}
          tone="success"
        />
        <StatTile
          label="Sudah dicairkan"
          value={rupiah(s?.paid ?? 0)}
          hint={`Menunggu ${rupiah(s?.pending ?? 0)}`}
          icon={Wallet}
        />
        <StatTile
          label="Bonus referal"
          value={rupiah(s?.from_referral ?? 0)}
          hint={`Penyesuaian ${rupiah(s?.from_adjustment ?? 0)}`}
          icon={BarChart3}
        />
        <StatTile
          label="Worker aktif"
          value={angka(s?.active_workers ?? 0)}
          hint={`Reward ${rupiah(data?.reward_per_message ?? 0)}/pesan`}
          icon={Trophy}
          tone="warning"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Tren harian" description="Pendapatan dan pencairan per hari.">
          {(data?.series ?? []).length === 0 ? (
            <EmptyState
              title={isLoading ? "Memuat data…" : "Belum ada transaksi"}
              description="Pilih periode lain atau tunggu aktivitas pengiriman berikutnya."
            />
          ) : (
            <div className="space-y-2">
              {(data?.series ?? []).map((d) => (
                <div key={d.date} className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground w-16 shrink-0">{tanggal(d.date)}</span>
                  <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${Math.max(2, (d.earned / maxSeries) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right font-medium">{rupiah(d.earned)}</span>
                  <span className="text-muted-foreground w-20 shrink-0 text-right">
                    {angka(d.messages)} pesan
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Audit dana" description="Pembanding dengan pembayaran agen.">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Pesan terkirim × tarif</dt>
              <dd className="font-medium">{rupiah(s?.expected_from_messages ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Tercatat di buku reward</dt>
              <dd className="font-medium">{rupiah(s?.from_messages ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Selisih</dt>
              <dd
                className={
                  (s?.variance ?? 0) === 0
                    ? "text-success font-medium"
                    : "text-warning font-medium"
                }
              >
                {rupiah(s?.variance ?? 0)}
              </dd>
            </div>
            <div className="border-border/60 mt-2 border-t pt-3" />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Pendapatan sepanjang waktu</dt>
              <dd className="font-medium">{rupiah(data?.all_time.earned ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Total dibayarkan</dt>
              <dd className="font-medium">{rupiah(data?.all_time.paid ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Klaim menunggu</dt>
              <dd className="font-medium">{rupiah(data?.all_time.pending ?? 0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium">Sisa kewajiban</dt>
              <dd className="text-primary font-semibold">
                {rupiah(data?.all_time.outstanding ?? 0)}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Peringkat worker"
        description="Diurutkan dari pendapatan terbesar pada periode terpilih."
        bodyClassName="p-0"
        action={
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setWorkerPage(0);
              }}
              placeholder="Cari worker…"
              className="w-56 pl-8"
            />
          </div>
        }
      >
        {error ? (
          <EmptyState title="Gagal memuat" description={(error as Error).message} />
        ) : filteredWorkers.length === 0 ? (
          <EmptyState
            title={isLoading ? "Memuat data…" : "Belum ada data worker"}
            description="Data muncul setelah ada pengiriman atau transaksi pada periode ini."
          />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Worker</Th>
                  <Th className="text-right">Pesan</Th>
                  <Th className="text-right">Pendapatan pesan</Th>
                  <Th className="text-right">Referal</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Dicairkan</Th>
                  <Th className="text-right">Menunggu</Th>
                  <Th className="text-right">Saldo berjalan</Th>
                </tr>
              </thead>
              <tbody>
                {workerRows.map((w, i) => {
                  const rank = workerPage * WORKER_PER_PAGE + i;
                  return (
                    <tr key={w.user_id}>
                      <Td>{MEDALS[rank] ?? rank + 1}</Td>
                      <Td>
                        <div className="font-medium">{w.name}</div>
                        <div className="text-muted-foreground text-xs">{w.email}</div>
                        {w.role !== "member" ? (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            {w.role === "super_admin" ? "Super Admin" : "Admin"}
                          </Badge>
                        ) : null}
                      </Td>
                      <Td className="text-right">{angka(w.messages)}</Td>
                      <Td className="text-right">{rupiah(w.from_messages)}</Td>
                      <Td className="text-right">{rupiah(w.from_referral)}</Td>
                      <Td className="text-right font-semibold">{rupiah(w.earned)}</Td>
                      <Td className="text-right">{rupiah(w.paid)}</Td>
                      <Td className="text-right">{rupiah(w.pending)}</Td>
                      <Td className="text-right">{rupiah(w.balance_all_time)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
            {workerTotalPages > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2 px-4 pb-4 text-xs text-muted-foreground sm:px-5">
                <span>
                  Menampilkan {workerPage * WORKER_PER_PAGE + 1}–
                  {Math.min((workerPage + 1) * WORKER_PER_PAGE, workerTotal)} dari {angka(workerTotal)} worker
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={workerPage === 0}
                    onClick={() => setWorkerPage(workerPage - 1)}
                  >
                    Sebelumnya
                  </Button>
                  <span className="whitespace-nowrap">
                    Halaman {workerPage + 1} / {workerTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={workerPage >= workerTotalPages - 1}
                    onClick={() => setWorkerPage(workerPage + 1)}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
