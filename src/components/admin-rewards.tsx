import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { rupiah } from "@/lib/currency";
import {
  adminListWithdrawals,
  getRewardSettings,
  saveRewardSettings,
  setWithdrawalStatus,
  type RewardSettings,
} from "@/lib/rewards.functions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Proses",
  approved: "Sukses",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

/** Pengaturan nilai reward, bonus referal, dan minimum penarikan (super admin). */
export function AdminRewardSettings() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getRewardSettings);
  const persist = useServerFn(saveRewardSettings);

  const { data } = useQuery({
    queryKey: ["reward-settings"],
    queryFn: () => fetchSettings(),
  });

  const [form, setForm] = useState<RewardSettings>({
    rewards_enabled: true,
    reward_per_message: 100,
    min_withdrawal: 50000,
    referral_levels: 1,
    referral_rate_l1: 100,
    referral_rate_l2: 0,
    referral_rate_l3: 0,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => persist({ data: form }),
    onSuccess: () => {
      toast.success("Pengaturan reward tersimpan");
      queryClient.invalidateQueries({ queryKey: ["reward-settings"] });
      queryClient.invalidateQueries({ queryKey: ["my-rewards"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const numberField = (
    id: keyof RewardSettings,
    label: string,
    hint?: string,
    disabled = false,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={String(id)}>{label}</Label>
      <Input
        id={String(id)}
        inputMode="numeric"
        disabled={disabled}
        value={String(form[id] ?? 0)}
        onChange={(e) =>
          setForm({ ...form, [id]: Number(e.target.value.replace(/[^0-9]/g, "") || 0) })
        }
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reward & Referal</CardTitle>
        <CardDescription>
          Nilai reward per pesan sukses, bonus referal per tingkat, dan minimum pencairan saldo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Program reward aktif</p>
            <p className="text-xs text-muted-foreground">
              Jika dimatikan, pesan sukses tidak lagi menghasilkan saldo.
            </p>
          </div>
          <Switch
            checked={form.rewards_enabled}
            onCheckedChange={(v) => setForm({ ...form, rewards_enabled: v })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {numberField("reward_per_message", "Reward per pesan sukses (Rp)")}
          {numberField("min_withdrawal", "Minimum penarikan (Rp)")}
          {numberField("referral_levels", "Jumlah tingkat referal (0–3)")}
          {numberField("referral_rate_l1", "Bonus referal tingkat 1 (Rp/pesan)", undefined, form.referral_levels < 1)}
          {numberField("referral_rate_l2", "Bonus referal tingkat 2 (Rp/pesan)", undefined, form.referral_levels < 2)}
          {numberField("referral_rate_l3", "Bonus referal tingkat 3 (Rp/pesan)", undefined, form.referral_levels < 3)}
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Simpan pengaturan reward
        </Button>
      </CardContent>
    </Card>
  );
}

/** Daftar pengajuan penarikan saldo untuk disetujui atau ditolak admin. */
export function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(adminListWithdrawals);
  const setStatus = useServerFn(setWithdrawalStatus);

  const { data } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => fetchList(),
    refetchInterval: 30_000,
  });

  const act = useMutation({
    mutationFn: (vars: { id: string; status: "approved" | "rejected" }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Pengajuan penarikan diperbarui");
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pengajuan penarikan</CardTitle>
        <CardDescription>Setujui atau tolak pencairan saldo anggota.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {(data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Belum ada pengajuan penarikan.
          </p>
        ) : (
          data!.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {w.name} · {rupiah(w.amount)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {w.email} · {w.provider} {w.account_number} ({w.account_name}) ·{" "}
                  {new Date(w.created_at).toLocaleString("id-ID")}
                </p>
              </div>
              <Badge variant="outline">{STATUS_LABEL[w.status] ?? w.status}</Badge>
              {w.status === "pending" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ id: w.id, status: "approved" })}
                  >
                    Setujui
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
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
