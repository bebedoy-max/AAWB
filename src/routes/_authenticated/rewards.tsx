import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, FileText, Trash2, Plus, Wallet } from "lucide-react";
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
  addPayoutAccount,
  deletePayoutAccount,
  setDefaultPayoutAccount,
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

function RewardsPage() {
  const queryClient = useQueryClient();
  const fetchRewards = useServerFn(getMyRewards);
  const fetchWithdrawals = useServerFn(listMyWithdrawals);
  const savePayout = useServerFn(savePayoutAccount);
  const addAccount = useServerFn(addPayoutAccount);
  const removeAccount = useServerFn(deletePayoutAccount);
  const makeDefault = useServerFn(setDefaultPayoutAccount);
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

  const [showForm, setShowForm] = useState(false);
  const [method, setMethod] = useState("bank");
  const [provider, setProvider] = useState("");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState("");
  const [targetId, setTargetId] = useState("");
  const payoutFormRef = useRef<HTMLDivElement>(null);

  const multi = Boolean(data?.accounts_table_ready);
  const accounts = data?.accounts ?? [];
  const legacyAccount = data?.payout.number
    ? [
        {
          id: "legacy",
          method: data.payout.method ?? "bank",
          provider: data.payout.provider ?? "",
          number: data.payout.number ?? "",
          name: data.payout.name ?? "",
          is_default: true,
        },
      ]
    : [];
  const list = multi ? accounts : legacyAccount;
  const hasAccount = list.length > 0;

  useEffect(() => {
    if (!hasAccount) return;
    if (targetId && list.some((a) => a.id === targetId)) return;
    const nextAccount = list.find((a) => a.is_default) ?? list[0];
    if (nextAccount) setTargetId(nextAccount.id);
  }, [hasAccount, list, targetId]);

  useEffect(() => {
    if (multi || !data?.payout) return;
    setMethod(data.payout.method ?? "bank");
    setProvider(data.payout.provider ?? "");
    setNumber(data.payout.number ?? "");
    setHolder(data.payout.name ?? "");
  }, [multi, data?.payout]);

  useEffect(() => {
    if (!showForm || !window.matchMedia("(max-width: 767px)").matches) return;
    window.requestAnimationFrame(() => {
      payoutFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [showForm]);

  const resetForm = () => {
    setProvider("");
    setNumber("");
    setHolder("");
  };

  const doSavePayout = useMutation({
    mutationFn: async () => {
      if (multi)
        return (await addAccount({
          data: { method, provider, number, name: holder },
        })) as { ok: boolean; error?: string };
      await savePayout({ data: { method, provider, number, name: holder } });
      return { ok: true } as { ok: boolean; error?: string };
    },
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.error ?? "Rekening tidak dapat disimpan.");
        return;
      }
      toast.success(multi ? "Rekening baru ditambahkan" : "Data rekening tersimpan");
      if (multi) {
        resetForm();
        setShowForm(false);
      }
      queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doDelete = useMutation({
    mutationFn: (id: string) =>
      removeAccount({ data: { id } }) as Promise<{ ok: boolean; error?: string }>,
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.error ?? "Rekening tidak dapat dihapus.");
        return;
      }
      toast.success("Rekening dihapus");
      queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doDefault = useMutation({
    mutationFn: (id: string) =>
      makeDefault({ data: { id } }) as Promise<{ ok: boolean; error?: string }>,
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.error ?? "Rekening utama tidak dapat diubah.");
        return;
      }
      toast.success("Rekening utama diperbarui");
      queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doWithdraw = useMutation({
    mutationFn: () =>
      ajukan({
        data:
          multi && targetId && targetId !== "legacy"
            ? { amount: Number(amount), account_id: targetId }
            : { amount: Number(amount) },
      }),
    onSuccess: (res) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Penarikan tidak dapat diproses.");
        return;
      }
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
  const labelOf = (a: { method: string; provider: string; number: string; name: string }) =>
    `${a.method === "bank" ? "Bank" : "E-wallet"} ${a.provider} · ${a.number} · a.n. ${a.name}`;


  return (
    <>
      <PageHeader title="Tarik Saldo" description="Cairkan penghasilan Anda ke rekening bank atau e-wallet." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="rounded-2xl shadow-panel">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div><p className="text-xs font-semibold uppercase text-muted-foreground">Saldo saat ini</p><CardTitle className="mt-5 text-3xl">{rupiah(balance)}</CardTitle></div>
            <div className="grid size-9 place-items-center rounded-lg bg-secondary"><Wallet className="size-4 text-primary" /></div>
          </CardHeader>
          <CardContent className="pt-8 sm:pt-14">
            <div className="flex items-center justify-between text-xs"><span>Progres penarikan</span><Badge variant="outline">Min. {rupiah(min)}</Badge></div>
            <Progress value={progress} className="mt-2 h-2" />
            <p className="mt-3 rounded-lg border border-warning-border bg-warning-surface p-3 text-xs font-semibold text-warning-surface-foreground">{balance >= min ? "Saldo sudah dapat ditarik." : `Kurang ${rupiah(min - balance)} untuk ditarik.`}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-panel">
          <CardHeader><CardTitle className="text-sm uppercase">Ajukan penarikan</CardTitle></CardHeader>
          <CardContent>
            {!hasAccount ? (
               <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-warning-border bg-warning-surface p-6 text-center sm:min-h-48">
                <div className="grid size-12 place-items-center rounded-full bg-warning/15"><AlertTriangle className="size-5 text-warning" /></div>
                 <p className="mt-3 font-semibold text-warning-surface-foreground">Data rekening belum diisi</p>
                 <p className="mt-1 max-w-sm text-xs text-warning-surface-foreground/80">Isi metode pencairan terlebih dahulu sebelum mengajukan penarikan dana.</p>
                 <Button type="button" className="mt-4 min-h-11" onClick={() => setShowForm(true)}>Isi data rekening sekarang</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5"><Label>Tujuan pencairan</Label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger><SelectValue placeholder="Pilih rekening" /></SelectTrigger><SelectContent>{list.map((a) => <SelectItem key={a.id} value={a.id}>{labelOf(a)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="amount">Jumlah penarikan</Label><Input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} placeholder={String(min)} /></div>
                <Button className="w-full" disabled={!amount || doWithdraw.isPending} onClick={() => doWithdraw.mutate()}>Ajukan penarikan</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(showForm || hasAccount) ? (
        <Card ref={payoutFormRef} className="mt-4 scroll-mt-24 rounded-xl shadow-panel">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div><CardTitle className="text-base">Rekening pencairan</CardTitle><CardDescription>Kelola bank atau e-wallet tujuan pencairan Anda.</CardDescription></div>{multi && !showForm ? <Button size="sm" variant="outline" disabled={list.length >= 4} onClick={() => setShowForm(true)}><Plus className="mr-1 size-4" /> Tambah</Button> : null}</CardHeader>
          <CardContent className="space-y-4">
            {!showForm && list.length ? <div className="grid gap-3 md:grid-cols-2">{list.map((a) => <div key={a.id} className="rounded-lg border bg-accent/30 p-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{a.method === "bank" ? "Bank" : "E-wallet"} {a.provider} · {a.number}</p><p className="text-xs text-muted-foreground">a.n. {a.name}</p></div>{a.is_default ? <Badge variant="outline">Utama</Badge> : null}</div>{multi ? <div className="mt-3 flex gap-2">{!a.is_default ? <Button size="sm" variant="outline" onClick={() => doDefault.mutate(a.id)}>Jadikan utama</Button> : null}<Button size="sm" variant="ghost" onClick={() => doDelete.mutate(a.id)}><Trash2 className="mr-1 size-3.5" /> Hapus</Button></div> : null}</div>)}</div> : null}
            {showForm || !multi ? <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1.5"><Label>Metode</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="ewallet">E-wallet</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="provider">{method === "bank" ? "Nama bank" : "Nama e-wallet"}</Label><Input id="provider" value={provider} onChange={(event) => setProvider(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="number">Nomor {method === "bank" ? "rekening" : "e-wallet"}</Label><Input id="number" value={number} onChange={(event) => setNumber(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="holder">Nama pemilik</Label><Input id="holder" value={holder} onChange={(event) => setHolder(event.target.value)} /></div><div className="flex gap-2 md:col-span-2"><Button onClick={() => doSavePayout.mutate()} disabled={doSavePayout.isPending}>{multi ? "Tambah rekening" : "Simpan rekening"}</Button>{multi ? <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button> : null}</div></div> : null}
          </CardContent>
        </Card>
      ) : null}

       <Card className="mt-6 rounded-2xl shadow-panel">
         <CardHeader className="border-b"><CardTitle className="text-base uppercase">Riwayat penarikan</CardTitle><div className="grid grid-cols-4 rounded-lg bg-secondary p-1 pt-1">{["Proses", "Sukses", "Ditolak", "Dibatalkan"].map((label, index) => <Badge key={label} variant="outline" className={index === 0 ? "justify-center border bg-card py-2 text-foreground" : "justify-center border-transparent py-2 text-muted-foreground"}>{label}</Badge>)}</div></CardHeader>
        <CardContent className="divide-y pt-5">
           {(history ?? []).length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed text-center sm:min-h-44 sm:border-0"><div className="grid size-12 place-items-center rounded-full border bg-card"><FileText className="size-5 text-muted-foreground" /></div><p className="mt-4 font-semibold">Belum ada riwayat</p><p className="mt-1 text-sm text-muted-foreground">Data penarikan Anda masih kosong.</p></div> : (history ?? []).map((w) => <div key={w.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium">{rupiah(w.amount)}</p><p className="truncate text-xs text-muted-foreground">{w.provider} · {w.account_number} · {new Date(w.created_at).toLocaleString("id-ID")}{w.note ? ` · ${w.note}` : ""}</p></div><Badge variant="outline">{STATUS_LABEL[w.status] ?? w.status}</Badge></div>)}
        </CardContent>
      </Card>
    </>
  );
}
