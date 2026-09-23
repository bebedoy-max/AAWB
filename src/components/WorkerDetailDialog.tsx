/**
 * Pop up detail worker di Monitor Blast. Super admin/admin bisa melihat identitas
 * lengkap worker, rapor tiap kampanye berjalan (terkirim, gagal, sisa, reward), lalu
 * melakukan Test Blast ke nomor pantau, menjeda perangkat, atau mengeluarkan worker
 * dari sebuah kampanye. Test blast tidak berbayar dan tidak masuk laporan kampanye.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, LogOut, Pause, Play, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, TableShell, Td, Th, angka, rupiah, waktu } from "@/components/admin-ui";
import {
  adminTestBlast,
  getWorkerDetail,
  setWorkerBlastEnabled,
  setWorkerCampaignBlock,
  type WorkerCampaignStat,
  type WorkerDetail,
} from "@/lib/worker-control.functions";

export interface WorkerDialogTarget {
  workerId: string;
  sessionId: string | null;
  phone: string;
}

function Baris({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function WorkerDetailDialog({
  target,
  onClose,
}: {
  target: WorkerDialogTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getWorkerDetail);
  const runTestBlast = useServerFn(adminTestBlast);
  const runToggleBlast = useServerFn(setWorkerBlastEnabled);
  const runBlock = useServerFn(setWorkerCampaignBlock);

  const [testPhone, setTestPhone] = useState("");
  const [testCampaign, setTestCampaign] = useState<string>("");
  const [kickTarget, setKickTarget] = useState<WorkerCampaignStat | null>(null);

  const workerId = target?.workerId ?? null;
  const sessionId = target?.sessionId ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["worker-detail", workerId],
    queryFn: () => fetchDetail({ data: { workerId: workerId as string } }),
    enabled: Boolean(workerId),
  });

  useEffect(() => {
    setTestPhone("");
    setKickTarget(null);
  }, [workerId]);

  useEffect(() => {
    if (data && !testCampaign && data.campaigns.length) setTestCampaign(data.campaigns[0]!.id);
  }, [data, testCampaign]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["worker-detail", workerId] });
    void queryClient.invalidateQueries({ queryKey: ["blast-monitor"] });
  };

  const testMutation = useMutation({
    mutationFn: () =>
      runTestBlast({
        data: { sessionId: sessionId as string, phone: testPhone, campaignId: testCampaign || null },
      }),
    onSuccess: (res) => {
      toast.success(`Test blast terkirim ke ${res.phone}. Tidak dihitung reward & tidak masuk laporan.`);
      setTestPhone("");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (enabled: boolean) => runToggleBlast({ data: { sessionId: sessionId as string, enabled } }),
    onSuccess: (res) => {
      toast.success(res.enabled ? "Blast worker dilanjutkan." : "Blast worker dijeda.");
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const blockMutation = useMutation({
    mutationFn: (input: { campaignId: string; blocked: boolean }) =>
      runBlock({ data: { workerId: workerId as string, campaignId: input.campaignId, blocked: input.blocked } }),
    onSuccess: (res) => {
      toast.success(
        res.blocked
          ? `Worker dikeluarkan dari kampanye. ${angka(res.released)} nomor dilepas ke worker lain.`
          : "Worker dikembalikan ke kampanye.",
      );
      setKickTarget(null);
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const device = data?.devices.find((d) => d.id === sessionId) ?? null;
  const paused = device ? device.blast_ready === false : false;

  return (
    <>
      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{data ? data.name : "Detail worker"}</DialogTitle>
            <DialogDescription>
              Nomor pengirim <span className="font-mono">{target?.phone ?? "—"}</span>
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat data worker…
            </div>
          ) : error ? (
            <EmptyState title="Data worker gagal dimuat" description={(error as Error).message} />
          ) : data ? (
            <div className="space-y-5">
              <Identitas data={data} sessionId={sessionId} />

              <section>
                <h3 className="mb-2 text-sm font-semibold">Kampanye yang sedang berjalan</h3>
                {data.campaigns.length ? (
                  <TableShell className="min-w-[520px]">
                    <thead className="border-b">
                      <tr>
                        <Th>Kampanye</Th>
                        <Th className="text-right">Terkirim</Th>
                        <Th className="text-right">Gagal</Th>
                        <Th className="text-right">Sisa</Th>
                        <Th className="text-right">Reward</Th>
                        <Th className="text-right">Aksi</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.campaigns.map((c) => (
                        <tr key={c.id}>
                          <Td>
                            <span className="block max-w-[180px] truncate">{c.name}</span>
                            {c.test_mode && (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                Mode uji
                              </Badge>
                            )}
                            {c.blocked && (
                              <Badge variant="destructive" className="mt-1 text-[10px]">
                                Dikeluarkan
                              </Badge>
                            )}
                          </Td>
                          <Td className="text-right">{angka(c.sent)}</Td>
                          <Td className="text-right">{angka(c.failed)}</Td>
                          <Td className="text-right">{angka(c.pending)}</Td>
                          <Td className="text-right">{rupiah(c.reward)}</Td>
                          <Td className="text-right">
                            {c.blocked ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={blockMutation.isPending}
                                onClick={() => blockMutation.mutate({ campaignId: c.id, blocked: false })}
                              >
                                Buka blokir
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                onClick={() => setKickTarget(c)}
                              >
                                <LogOut className="mr-1 size-3.5" />
                                Kick
                              </Button>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                ) : (
                  <EmptyState title="Worker ini belum mengerjakan kampanye yang berjalan" />
                )}
              </section>

              <section className="rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Test Blast ke nomor pantau</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Perangkat worker langsung mengirim satu pesan ke nomor ini, lalu lanjut blast ke sisa nomor
                  target. Pesan uji tidak dihitung reward dan tidak tercatat di laporan kampanye.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Nomor pantau, contoh 6281234567890"
                    inputMode="numeric"
                    maxLength={20}
                    className="w-full font-mono sm:w-60"
                  />
                  {data.campaigns.length > 1 && (
                    <select
                      value={testCampaign}
                      onChange={(e) => setTestCampaign(e.target.value)}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      {data.campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    size="sm"
                    disabled={!sessionId || testPhone.replace(/\D/g, "").length < 8 || testMutation.isPending}
                    onClick={() => testMutation.mutate()}
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1 size-3.5" />
                    )}
                    Kirim Test Blast
                  </Button>
                </div>
                {!sessionId && (
                  <p className="mt-2 text-xs text-destructive">
                    Perangkat pengirim nomor ini tidak ditemukan, test blast tidak tersedia.
                  </p>
                )}
              </section>

              {!data.migrated && (
                <p className="text-xs text-destructive">
                  Migrasi 032 belum dijalankan di database, jadi rapor kampanye dan fitur kick belum aktif.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={!sessionId || pauseMutation.isPending}
              onClick={() => pauseMutation.mutate(paused)}
            >
              {paused ? <Play className="mr-1 size-3.5" /> : <Pause className="mr-1 size-3.5" />}
              {paused ? "Lanjutkan blast" : "Pause worker"}
            </Button>
            <Button size="sm" onClick={onClose}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(kickTarget)} onOpenChange={(open) => !open && setKickTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan worker dari kampanye ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Sisa nomor yang dia pegang di kampanye “{kickTarget?.name}” dilepas kembali ke kolam supaya worker
              lain mengerjakannya, dan dia tidak bisa mengambil nomor kampanye ini lagi. Kampanye lain tidak
              terpengaruh dan blokir bisa dibuka kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => kickTarget && blockMutation.mutate({ campaignId: kickTarget.id, blocked: true })}
            >
              Keluarkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Identitas({ data, sessionId }: { data: WorkerDetail; sessionId: string | null }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="mb-1 text-sm font-semibold">Identitas</h3>
        <Baris label="Nama" value={data.name} />
        <Baris label="Username" value={data.username || "—"} />
        <Baris label="Email" value={data.email || "—"} />
        <Baris
          label="Telegram"
          value={
            data.telegram
              ? `${data.telegram.username ? `@${data.telegram.username}` : data.telegram.chat_id || "tertaut"}`
              : "Belum tertaut"
          }
        />
        <Baris label="Total pesan terkirim" value={angka(data.total_sent)} />
        <Baris label="Total reward" value={rupiah(data.reward_total)} />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Pembayaran & perangkat</h3>
        <Baris
          label="Tujuan penarikan"
          value={
            data.payout.number
              ? `${data.payout.provider || data.payout.method || "—"} · ${data.payout.number}${
                  data.payout.name ? ` (${data.payout.name})` : ""
                }`
              : "Belum diisi"
          }
        />
        {data.devices.length ? (
          data.devices.map((d) => (
            <Baris
              key={d.id}
              label={
                <>
                  <span className="font-mono">{d.phone || "—"}</span>
                  {d.id === sessionId && <span className="ml-1 text-[10px] uppercase">dipakai</span>}
                </>
              }
              value={
                <span className="text-xs">
                  {d.status || "—"} · {d.blast_speed || "—"} ·{" "}
                  {d.blast_ready === false ? "start mati" : "start aktif"}
                  {d.cooldown_until ? ` · dingin s/d ${waktu(d.cooldown_until)}` : ""}
                </span>
              }
            />
          ))
        ) : (
          <Baris label="Perangkat" value="Tidak ada" />
        )}
      </div>
    </section>
  );
}
