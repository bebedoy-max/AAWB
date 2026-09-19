/**
 * Tabel log aktivitas pengguna & admin untuk halaman Admin.
 * Aktivitas Super Admin tidak dicatat, jadi tidak akan muncul di sini.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listActivityLog, type ActivityRow } from "@/lib/activity-log.functions";

const ACTION_LABEL: Record<string, string> = {
  login: "Masuk",
  logout: "Keluar",
  role_change: "Ubah peran",
  password_reset: "Reset kata sandi",
  user_delete: "Hapus pengguna",
  blast_start: "Mulai blast",
  blast_pause: "Jeda blast",
  blast_resume: "Lanjutkan blast",
  blast_abort: "Batalkan blast",
  blast_retry: "Kirim ulang blast",
  withdrawal_request: "Ajukan penarikan",
  withdrawal_approved: "Setujui penarikan",
  withdrawal_rejected: "Tolak penarikan",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  member: "Worker's",
  super_admin: "Super Admin",
};

function formatTime(value: string): string {
  const d = new Date(value);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 20;

export function AdminActivityLog() {
  const fetchLog = useServerFn(listActivityLog);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["activity-log"],
    queryFn: () => fetchLog(),
  });

  const rows = useMemo(() => {
    const list: ActivityRow[] = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) =>
      [r.actor_name, r.action, ACTION_LABEL[r.action], r.detail, r.actor_role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="size-4" />
              User Log
            </CardTitle>
            <CardDescription>
              Aktivitas pengguna dan admin, terbaru di atas. Aktivitas Super Admin tidak dicatat.
            </CardDescription>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Cari email atau aktivitas"
              className="min-w-0 flex-1 sm:w-60 sm:flex-none"
            />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Waktu</th>
                  <th className="py-2 pr-4 font-medium">Pengguna</th>
                  <th className="py-2 pr-4 font-medium">Peran</th>
                  <th className="py-2 pr-4 font-medium">Aktivitas</th>
                  <th className="py-2 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                      {formatTime(r.created_at)}
                    </td>
                    <td className="py-2 pr-4">{r.actor_name ?? "Nama belum tersedia"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline">{ROLE_LABEL[r.actor_role] ?? r.actor_role}</Badge>
                    </td>
                    <td className="py-2 pr-4 font-medium">{ACTION_LABEL[r.action] ?? r.action}</td>
                    <td className="py-2 text-muted-foreground">{r.detail ?? "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Belum ada aktivitas tercatat.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} dari{" "}
              {rows.length} log
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1 || isFetching}
              >
                Sebelumnya
              </Button>
              {generatePageNumbers(safePage, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === safePage ? "default" : "outline"}
                    size="sm"
                    className="min-w-8 px-2"
                    onClick={() => goToPage(p)}
                    disabled={isFetching}
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= totalPages || isFetching}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function generatePageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}
