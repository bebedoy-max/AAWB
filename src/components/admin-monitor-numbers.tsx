/**
 * Panel "Nomor Pantau" (khusus super admin).
 * Mengatur nomor pengawas, sasaran pengirim/worker, aturan kode negara,
 * interval pesan, dan menampilkan riwayat salinan pantau.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Panel, EmptyState, TableShell, Td, Th, waktu } from "@/components/admin-ui";
import {
  addMonitorNumber,
  addMonitorTarget,
  deleteMonitorNumber,
  deleteMonitorTarget,
  getMonitorOverview,
  saveMonitorSettings,
  toggleMonitorNumber,
} from "@/lib/monitor-numbers.functions";
import { listMembers } from "@/lib/admin.functions";

export function AdminMonitorNumbers() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getMonitorOverview);
  const fetchMembers = useServerFn(listMembers);

  const saveSettings = useServerFn(saveMonitorSettings);
  const addNumber = useServerFn(addMonitorNumber);
  const toggleNumber = useServerFn(toggleMonitorNumber);
  const removeNumber = useServerFn(deleteMonitorNumber);
  const addTarget = useServerFn(addMonitorTarget);
  const removeTarget = useServerFn(deleteMonitorTarget);

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitor-overview"],
    queryFn: () => fetchOverview(),
    retry: false,
  });
  const { data: members } = useQuery({
    queryKey: ["members-for-monitor"],
    queryFn: () => fetchMembers(),
    retry: false,
  });

  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalValue] = useState("20");
  const [countryCodes, setCountryCodes] = useState("");
  const [includeNote, setIncludeNote] = useState(true);
  const [allEnabled, setAllEnabled] = useState(false);
  const [allInterval, setAllInterval] = useState("50");
  const [touched, setTouched] = useState(false);

  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [workerId, setWorkerId] = useState("");

  useEffect(() => {
    if (data && !touched) {
      setEnabled(data.settings.enabled);
      setIntervalValue(String(data.settings.interval));
      setCountryCodes(data.settings.country_codes);
      setIncludeNote(data.settings.include_note);
      setAllEnabled(data.settings.all_enabled);
      setAllInterval(String(data.settings.all_interval));
    }
  }, [data, touched]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["monitor-overview"] });
  const onError = (e: Error) => toast.error(e.message);

  const settingsMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        data: { enabled, interval: Number(interval), countryCodes, includeNote, allEnabled, allInterval: Number(allInterval) },
      }),
    onSuccess: () => {
      toast.success("Pengaturan nomor pantau tersimpan");
      setTouched(false);
      refresh();
    },
    onError,
  });

  const numberMutation = useMutation({
    mutationFn: () => addNumber({ data: { phone, label } }),
    onSuccess: () => {
      setPhone("");
      setLabel("");
      toast.success("Nomor pantau ditambahkan");
      refresh();
    },
    onError,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => toggleNumber({ data: vars }),
    onSuccess: refresh,
    onError,
  });

  const deleteNumberMutation = useMutation({
    mutationFn: (id: string) => removeNumber({ data: { id } }),
    onSuccess: () => {
      toast.success("Nomor pantau dihapus");
      refresh();
    },
    onError,
  });

  const senderMutation = useMutation({
    mutationFn: () => addTarget({ data: { kind: "sender_phone", value: senderPhone } }),
    onSuccess: () => {
      setSenderPhone("");
      toast.success("Nomor pengirim ditambahkan ke sasaran pantau");
      refresh();
    },
    onError,
  });

  const workerMutation = useMutation({
    mutationFn: () => {
      const member = (members ?? []).find((m) => m.user_id === workerId);
      return addTarget({
        data: { kind: "worker", userId: workerId, label: member?.name ?? member?.email ?? "" },
      });
    },
    onSuccess: () => {
      setWorkerId("");
      toast.success("Worker ditambahkan ke sasaran pantau");
      refresh();
    },
    onError,
  });

  const deleteTargetMutation = useMutation({
    mutationFn: (id: string) => removeTarget({ data: { id } }),
    onSuccess: () => {
      toast.success("Sasaran pantau dihapus");
      refresh();
    },
    onError,
  });

  if (isLoading) return <Panel title="Nomor Pantau"><p className="text-sm text-muted-foreground">Memuat…</p></Panel>;
  if (error) {
    return (
      <Panel title="Nomor Pantau">
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      </Panel>
    );
  }

  const numbers = data?.numbers ?? [];
  const targets = data?.targets ?? [];
  const log = data?.log ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Nomor Pantau"
        description="Nomor pengawas yang ikut menerima salinan pesan kampanye. Salinan ini tidak menghasilkan reward dan tidak masuk laporan pengiriman."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Aktifkan pengawasan</p>
              <p className="text-xs text-muted-foreground">
                Bila mati, tidak ada salinan pesan yang dikirim ke nomor pantau.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => {
                setTouched(true);
                setEnabled(v);
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="monitor-interval">Kirim setiap berapa pesan</Label>
              <Input
                id="monitor-interval"
                inputMode="numeric"
                value={interval}
                onChange={(e) => {
                  setTouched(true);
                  setIntervalValue(e.target.value.replace(/\D/g, ""));
                }}
              />
              <p className="text-xs text-muted-foreground">
                Contoh: 20 — setiap 20 pesan terkirim, satu salinan dikirim ke nomor pantau.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monitor-codes">Kode negara pengirim</Label>
              <Input
                id="monitor-codes"
                placeholder="contoh: 62, 60"
                value={countryCodes}
                onChange={(e) => {
                  setTouched(true);
                  setCountryCodes(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Pisahkan dengan koma. Contoh: 62 — semua worker dengan nomor pengirim Indonesia
                ikut mengirim salinan ke nomor pantau. Kosongkan bila tidak memakai aturan ini.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Pantau semua workers</p>
                <p className="text-xs text-muted-foreground">
                  Setiap worker mengirim salinan pesan kampanye yang sedang berjalan ke nomor pantau
                  per jumlah pesan di bawah. Tidak dihitung reward dan tidak masuk laporan pengiriman.
                </p>
              </div>
              <Switch
                checked={allEnabled}
                onCheckedChange={(v) => {
                  setTouched(true);
                  setAllEnabled(v);
                }}
              />
            </div>
            {allEnabled ? (
              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="monitor-all-interval">Kirim setiap berapa pesan (semua workers)</Label>
                <Input
                  id="monitor-all-interval"
                  inputMode="numeric"
                  value={allInterval}
                  onChange={(e) => {
                    setTouched(true);
                    setAllInterval(e.target.value.replace(/\D/g, ""));
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Sertakan keterangan di atas pesan</p>
              <p className="text-xs text-muted-foreground">
                Menambahkan nomor pengirim dan nomor penerima asli pada salinan pantau.
              </p>
            </div>
            <Switch
              checked={includeNote}
              onCheckedChange={(v) => {
                setTouched(true);
                setIncludeNote(v);
              }}
            />
          </div>

          <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
            Simpan pengaturan
          </Button>

          <p className="text-xs text-muted-foreground">
            Bila tidak ada sasaran maupun kode negara yang diisi, aturan berlaku untuk semua pengirim.
          </p>
        </div>
      </Panel>

      <Panel title="Daftar nomor pantau" description="Nomor HP pengawas yang menerima salinan pesan.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              placeholder="Nomor pantau, contoh: 6281234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input placeholder="Keterangan (opsional)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button onClick={() => numberMutation.mutate()} disabled={numberMutation.isPending || !phone}>
              Tambah
            </Button>
          </div>

          {numbers.length === 0 ? (
            <EmptyState title="Belum ada nomor pantau" description="Tambahkan minimal satu nomor agar pengawasan berjalan." />
          ) : (
            <TableShell>
              <thead>
                <tr className="border-b">
                  <Th>Nomor</Th>
                  <Th>Keterangan</Th>
                  <Th>Aktif</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => (
                  <tr key={n.id} className="border-b last:border-0">
                    <Td className="font-medium">{n.phone}</Td>
                    <Td className="text-muted-foreground">{n.label ?? "—"}</Td>
                    <Td>
                      <Switch
                        checked={n.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: n.id, active: v })}
                      />
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => deleteNumberMutation.mutate(n.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </Panel>

      <Panel
        title="Sasaran pantau"
        description="Nomor pengirim atau worker yang wajib ikut mengirim ke nomor pantau."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              placeholder="Nomor pengirim, contoh: 6281234567890"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => senderMutation.mutate()}
              disabled={senderMutation.isPending || !senderPhone}
            >
              Tambah nomor pengirim
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              aria-label="Pilih worker"
            >
              <option value="">Pilih worker…</option>
              {(members ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} — {m.email}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => workerMutation.mutate()}
              disabled={workerMutation.isPending || !workerId}
            >
              Tambah worker
            </Button>
          </div>

          {targets.length === 0 ? (
            <EmptyState
              title="Belum ada sasaran"
              description="Tanpa sasaran, aturan berlaku untuk semua pengirim (atau sesuai kode negara)."
            />
          ) : (
            <TableShell className="min-w-[480px]">
              <thead>
                <tr className="border-b">
                  <Th>Jenis</Th>
                  <Th>Detail</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <Td>{t.kind === "worker" ? "Worker" : "Nomor pengirim"}</Td>
                    <Td className="font-medium">
                      {t.kind === "worker"
                        ? (t.label ??
                          (members ?? []).find((m) => m.user_id === t.user_id)?.name ??
                          t.user_id)
                        : t.value}
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => deleteTargetMutation.mutate(t.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </Panel>

      <Panel title="Riwayat pantau" description="50 salinan terakhir yang dikirim ke nomor pantau.">
        {log.length === 0 ? (
          <EmptyState title="Belum ada salinan pantau" />
        ) : (
          <TableShell className="min-w-[720px]">
            <thead>
              <tr className="border-b">
                <Th>Waktu</Th>
                <Th>Nomor pantau</Th>
                <Th>Pengirim</Th>
                <Th>Penerima asli</Th>
                <Th>Alasan</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <Td className="whitespace-nowrap text-muted-foreground">{waktu(l.created_at)}</Td>
                  <Td className="font-medium">{l.monitor_phone}</Td>
                  <Td>{l.sender_phone ?? "—"}</Td>
                  <Td>{l.recipient_phone ?? "—"}</Td>
                  <Td className="text-muted-foreground">{l.reason ?? "—"}</Td>
                  <Td className={l.status === "sent" ? "text-success" : "text-destructive"}>
                    {l.status === "sent" ? "Terkirim" : (l.error_log ?? "Gagal")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>
    </div>
  );
}
