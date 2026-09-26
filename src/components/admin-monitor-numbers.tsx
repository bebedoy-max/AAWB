/**
 * Panel "Nomor Pantau" (khusus super admin).
 * Mengatur nomor pengawas, aturan kode negara, interval pesan,
 * dan menampilkan riwayat salinan pantau.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Panel, EmptyState, TableShell, Td, Th, waktu } from "@/components/admin-ui";
import {
  addMonitorNumber,
  clearMonitorLog,
  deleteMonitorNumber,
  getMonitorOverview,
  saveMonitorSettings,
  toggleMonitorNumber,
} from "@/lib/monitor-numbers.functions";

const LOG_PAGE_SIZE = 10;

export function AdminMonitorNumbers() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getMonitorOverview);

  const saveSettings = useServerFn(saveMonitorSettings);
  const addNumber = useServerFn(addMonitorNumber);
  const toggleNumber = useServerFn(toggleMonitorNumber);
  const removeNumber = useServerFn(deleteMonitorNumber);
  const clearLog = useServerFn(clearMonitorLog);

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitor-overview"],
    queryFn: () => fetchOverview(),
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
  const [logPage, setLogPage] = useState(1);

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

  const clearLogMutation = useMutation({
    mutationFn: () => clearLog(),
    onSuccess: () => {
      setLogPage(1);
      toast.success("Riwayat pantau dibersihkan");
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
  const log = data?.log ?? [];
  const logPageCount = Math.max(1, Math.ceil(log.length / LOG_PAGE_SIZE));
  const safeLogPage = Math.min(logPage, logPageCount);
  const visibleLog = log.slice((safeLogPage - 1) * LOG_PAGE_SIZE, safeLogPage * LOG_PAGE_SIZE);

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
            Bila kode negara dikosongkan, aturan berlaku untuk semua pengirim.
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
        title="Riwayat pantau"
        description="50 salinan terakhir yang dikirim ke nomor pantau."
        action={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={!log.length || clearLogMutation.isPending}>
                <Trash2 className="mr-2 size-4" />
                {clearLogMutation.isPending ? "Membersihkan…" : "Clear"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bersihkan seluruh riwayat pantau?</AlertDialogTitle>
                <AlertDialogDescription>
                  Semua catatan salinan pantau akan dihapus permanen. Pengaturan dan nomor pantau tidak berubah.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearLogMutation.mutate()}>Bersihkan</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      >
        {log.length === 0 ? (
          <EmptyState title="Belum ada salinan pantau" />
        ) : (
          <div className="space-y-4">
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
                {visibleLog.map((l) => (
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
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                aria-label="Halaman sebelumnya"
                disabled={safeLogPage === 1}
                onClick={() => setLogPage((page) => Math.max(1, page - 1))}
              >
                <ChevronLeft className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </Button>
              <p className="truncate text-center text-xs text-muted-foreground">
                Halaman {safeLogPage} dari {logPageCount}
              </p>
              <Button
                variant="outline"
                size="sm"
                aria-label="Halaman berikutnya"
                disabled={safeLogPage === logPageCount}
                onClick={() => setLogPage((page) => Math.min(logPageCount, page + 1))}
              >
                <span className="hidden sm:inline">Berikutnya</span>
                <ChevronRight className="size-4 sm:ml-2" />
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
