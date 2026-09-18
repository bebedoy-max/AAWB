/** Manajemen klaim dana: pengajuan penarikan member dengan tab status. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Clock, RefreshCw, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminListWithdrawals, setWithdrawalStatus } from "@/lib/rewards.functions";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  TableShell,
  Td,
  Th,
  rupiah,
  waktu,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/klaim")({
  component: KlaimPage,
});

const TABS = [
  { value: "pending", label: "Menunggu" },
  { value: "approved", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Selesai",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-warning/40 text-warning",
  approved: "border-success/40 text-success",
  rejected: "border-destructive/40 text-destructive",
  cancelled: "text-muted-foreground",
};

function KlaimPage() {
  const queryClient = useQueryClient();
  const fetchWithdrawals = useServerFn(adminListWithdrawals);
  const setStatus = useServerFn(setWithdrawalStatus);
  const [tab, setTab] = useState<string>("pending");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => fetchWithdrawals(),
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    const sum = (status: string) =>
      list.filter((w) => w.status === status).reduce((s, w) => s + Number(w.amount), 0);
    return {
      pending: sum("pending"),
      approved: sum("approved"),
      rejected: sum("rejected"),
      pendingCount: list.filter((w) => w.status === "pending").length,
    };
  }, [data]);

  const rows = (data ?? []).filter((w) =>
    tab === "approved" ? w.status === "approved" : w.status === tab,
  );

  const act = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected" }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Pengajuan penarikan diperbarui");
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AdminPageTitle
        title="Manajemen Klaim Dana"
        description="Tinjau dan proses pengajuan pencairan saldo dari Worker's."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
            Muat ulang
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Menunggu diproses"
          value={rupiah(stats.pending)}
          hint={`${stats.pendingCount} pengajuan`}
          icon={Clock}
          tone="warning"
        />
        <StatTile label="Sudah dibayar" value={rupiah(stats.approved)} icon={CheckCircle2} tone="success" />
        <StatTile label="Ditolak" value={rupiah(stats.rejected)} icon={XCircle} tone="danger" />
      </div>

      <Panel
        className="mt-4"
        title="Pengajuan penarikan"
        bodyClassName="p-0"
        action={
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        {error ? (
          <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Tidak ada pengajuan"
            description="Pengajuan pencairan dari Worker's akan tampil pada tab ini."
          />
        ) : (
          <TableShell>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Worker's</Th>
                <Th>Jumlah</Th>
                <Th>Tujuan pencairan</Th>
                <Th>Diajukan</Th>
                <Th>Status</Th>
                <Th className="text-right">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-b last:border-0 hover:bg-muted/40">
                  <Td>
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.email}</p>
                  </Td>
                  <Td className="font-semibold">{rupiah(Number(w.amount))}</Td>
                  <Td>
                    <p className="text-sm">
                      {w.provider} · {w.account_number}
                    </p>
                    <p className="text-xs text-muted-foreground">{w.account_name}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{waktu(w.created_at)}</Td>
                  <Td>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLE[w.status] ?? "text-muted-foreground"}
                    >
                      {STATUS_LABEL[w.status] ?? w.status}
                    </Badge>
                    {w.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{w.note}</p>
                    ) : null}
                  </Td>
                  <Td className="text-right">
                    {w.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: w.id, status: "approved" })}
                        >
                          <Wallet className="mr-1 size-3.5" /> Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: w.id, status: "rejected" })}
                        >
                          Tolak
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {waktu(w.processed_at)}
                      </span>
                    )}
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
