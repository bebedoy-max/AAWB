import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet, TrendingUp, Users, Send } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rupiah } from "@/lib/currency";
import {
  getMyRewards,
  listMyWithdrawals,
  requestWithdrawal,
  savePayoutAccount,
} from "@/lib/rewards.functions";

export const Route = createFileRoute("/_authenticated/rewards")({
  head: () => ({
    meta: [
      { title: "Saldo & Reward — AAWB" },
      {
        name: "description",
        content: "Lihat reward dari pesan blast yang berhasil terkirim dan ajukan pencairan saldo.",
      },
      { property: "og:title", content: "Saldo & Reward — AAWB" },
      {
        property: "og:description",
        content: "Reward per pesan terkirim, bonus referal, dan pencairan saldo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RewardsPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Proses",
  approved: "Sukses",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function RewardsPage() {
  const queryClient = useQueryClient();
  const fetchRewards = useServerFn(getMyRewards);
  const fetchWithdrawals = useServerFn(listMyWithdrawals);
  const savePayout = useServerFn(savePayoutAccount);
  const ajukan = useServerFn(requestWithdrawal);

  const { data } = useQuery({
    queryKey: ["my-rewards"],
    queryFn: () => fetchRewards(),
    refetchInterval: 20_000,
  });
  const { data: history } = useQuery({
    queryKey: ["my-withdrawals"],
    queryFn: () => fetchWithdrawals(),
  });

  const [method, setMethod] = useState("bank");
  const [provider, setProvider] = useState("");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!data?.payout) return;
    setMethod(data.payout.method ?? "bank");
    setProvider(data.payout.provider ?? "");
    setNumber(data.payout.number ?? "");
    setHolder(data.payout.name ?? "");
  }, [data?.payout]);

  const doSavePayout = useMutation({
    mutationFn: () => savePayout({ data: { method, provider, number, name: holder } }),
    onSuccess: () => {
      toast.success("Data rekening tersimpan");
      queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doWithdraw = useMutation({
    mutationFn: () => ajukan({ data: { amount: Number(amount) } }),
    onSuccess: () => {
      toast.success("Pengajuan penarikan terkirim dan menunggu persetujuan admin");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const min = data?.settings.min_withdrawal ?? 0;
  const balance = data?.balance ?? 0;
  const progress = min > 0 ? Math.min((balance / min) * 100, 100) : 100;
  const hasAccount = Boolean(data?.payout.number);

  return (
    <>
      <PageHeader
        title="Saldo & Reward"
        description="Reward otomatis dari setiap pesan blast yang berhasil terkirim dari perangkat Anda."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Wallet}
          label="Saldo tersedia"
          value={rupiah(balance)}
          hint={`Minimum penarikan ${rupiah(min)}`}
        />
        <Stat
          icon={TrendingUp}
          label="Total penghasilan"
          value={rupiah(data?.total_earned)}
          hint={`Sudah dicairkan ${rupiah(data?.total_withdrawn)}`}
        />
        <Stat
          icon={Send}
          label="Pesan sukses"
          value={String(data?.messages_sent ?? 0)}
          hint={`${rupiah(data?.settings.reward_per_message)} per pesan sukses`}
        />
        <Stat
          icon={Users}
          label="Bonus referal"
          value={rupiah(data?.from_referral)}
          hint={`Reward pesan ${rupiah(data?.from_messages)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ajukan penarikan</CardTitle>
            <CardDescription>
              Penarikan diproses setelah disetujui admin. Saldo yang diajukan ditahan sementara.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Progress value={progress} className="h-2" />
              <p className="mt-2 text-xs text-muted-foreground">
                {balance >= min
                  ? "Saldo Anda sudah memenuhi minimum penarikan."
                  : `Kurang ${rupiah(min - balance)} untuk dapat ditarik.`}
              </p>
            </div>
            {!hasAccount ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Lengkapi data rekening pencairan di samping sebelum mengajukan penarikan.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="amount">Jumlah penarikan</Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={String(min)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!hasAccount || !amount || doWithdraw.isPending}
              onClick={() => doWithdraw.mutate()}
            >
              Ajukan penarikan
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rekening pencairan</CardTitle>
            <CardDescription>Bank atau e-wallet tujuan pencairan saldo Anda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="ewallet">E-wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider">{method === "bank" ? "Nama bank" : "Nama e-wallet"}</Label>
              <Input
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder={method === "bank" ? "BCA" : "DANA"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="number">Nomor {method === "bank" ? "rekening" : "e-wallet"}</Label>
              <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holder">Nama pemilik</Label>
              <Input id="holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={doSavePayout.isPending}
              onClick={() => doSavePayout.mutate()}
            >
              Simpan rekening
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Riwayat penarikan</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(history ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada pengajuan penarikan.
            </p>
          ) : (
            history!.map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{rupiah(w.amount)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {w.provider} · {w.account_number} ·{" "}
                    {new Date(w.created_at).toLocaleString("id-ID")}
                    {w.note ? ` · ${w.note}` : ""}
                  </p>
                </div>
                <Badge variant="outline">{STATUS_LABEL[w.status] ?? w.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Riwayat reward</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(data?.ledger ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada reward. Kirim pesan blast dari perangkat Anda untuk mulai mendapatkan reward.
            </p>
          ) : (
            data!.ledger.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {l.kind === "message"
                      ? "Reward pesan terkirim"
                      : l.kind === "referral"
                        ? `Bonus referal tingkat ${l.level}`
                        : "Penyesuaian saldo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("id-ID")}
                    {l.note ? ` · ${l.note}` : ""}
                  </p>
                </div>
                <span className="text-sm font-medium text-primary">+{rupiah(l.amount)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
