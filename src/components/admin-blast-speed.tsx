/**
 * Panel "Kecepatan Blast" di Pengaturan admin: preset Slow–Brutal, parameter manual,
 * dan rem otomatis. Perubahan berlaku di pengirim dalam ±1 menit, tanpa deploy.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Gauge, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Panel, waktu } from "@/components/admin-ui";
import { cn } from "@/lib/utils";
import { getBlastSpeedSettings, saveBlastSpeedSettings } from "@/lib/blast-control.functions";
import {
  BLAST_PRESETS,
  BLAST_PRESET_ORDER,
  SPEED_LIMITS,
  matchPreset,
  validateSpeedValues,
  type BlastPresetId,
  type BlastSpeedValues,
} from "@/lib/blast-presets";

const FIELDS: {
  key: keyof BlastSpeedValues;
  label: string;
  hint: string;
  unit: string;
<<<<<<< HEAD
  group: "mapan" | "baru" | "batas" | "perangkat";
=======
  group: "mapan" | "baru" | "batas";
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
}[] = [
  { key: "minDelaySec", label: "Jeda minimal", hint: "Antar pesan, per nomor mapan", unit: "detik", group: "mapan" },
  { key: "maxDelaySec", label: "Jeda maksimal", hint: "Jeda diacak di antara min–maks", unit: "detik", group: "mapan" },
  { key: "hourlyCap", label: "Batas per jam", hint: "Per nomor pengirim (maks. 1000)", unit: "pesan", group: "batas" },
  { key: "dailyCap", label: "Batas per hari", hint: "Per nomor, 24 jam terakhir. 0 = tanpa batas", unit: "pesan", group: "batas" },
  { key: "warmupCount", label: "Ambang nomor mapan", hint: "Di bawah ini dianggap nomor baru", unit: "pesan terkirim", group: "baru" },
  { key: "warmupMinSec", label: "Jeda minimal nomor baru", hint: "Masa pemanasan", unit: "detik", group: "baru" },
  { key: "warmupMaxSec", label: "Jeda maksimal nomor baru", hint: "Masa pemanasan", unit: "detik", group: "baru" },
<<<<<<< HEAD
  {
    key: "maxDevicesPerNumber",
    label: "Max Perangkat Per Nomor",
    hint: "1–4. Worker tetap bisa menautkan 4 perangkat, tapi hanya sebanyak ini yang dipakai blast",
    unit: "perangkat",
    group: "perangkat",
  },
=======
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
];

export function AdminBlastSpeedSettings() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getBlastSpeedSettings);
  const persist = useServerFn(saveBlastSpeedSettings);
  const { data, isLoading, error } = useQuery({
    queryKey: ["blast-speed-settings"],
    queryFn: () => fetchSettings(),
  });

  const [values, setValues] = useState<BlastSpeedValues | null>(null);
  const [autoBrake, setAutoBrake] = useState(false);
  const [threshold, setThreshold] = useState(10);

  useEffect(() => {
    if (!data) return;
    setValues(data.values);
    setAutoBrake(data.autoBrake);
    setThreshold(data.autoBrakeThreshold);
  }, [data]);

  const current = useMemo(() => (values ? matchPreset(values) : "kustom"), [values]);
  const problem = values ? validateSpeedValues(values) : null;
  const dirty =
    Boolean(data && values) &&
    (JSON.stringify(values) !== JSON.stringify(data?.values) ||
      autoBrake !== data?.autoBrake ||
      threshold !== data?.autoBrakeThreshold);

  const save = useMutation({
    mutationFn: () =>
      persist({ data: { values: values as BlastSpeedValues, autoBrake, autoBrakeThreshold: threshold } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["blast-speed-settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["blast-monitor"] });
      toast.success("Kecepatan blast disimpan — berlaku dalam ±1 menit");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !values) {
    return (
      <Panel title="Kecepatan Blast">
        <p className="text-sm text-muted-foreground">{error ? (error as Error).message : "Memuat…"}</p>
      </Panel>
    );
  }

  const choose = (id: BlastPresetId) => setValues({ ...BLAST_PRESETS[id].values });
  const setField = (key: keyof BlastSpeedValues, raw: string) =>
    setValues((prev) => (prev ? { ...prev, [key]: raw === "" ? Number.NaN : Math.round(Number(raw)) } : prev));

  const activePreset = current === "kustom" ? null : BLAST_PRESETS[current];

  return (
    <>
      <Panel
        title="Kecepatan Blast"
        description="Batas kecepatan per nomor pengirim. Berlaku di semua kampanye dalam ±1 menit, tanpa deploy."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/monitor">
              <Gauge className="mr-2 size-4" />
              Buka Monitor Blast
            </Link>
          </Button>
        }
      >
        {!data?.migrated ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>Migrasi database 027 belum dijalankan. Jalankan SQL 027 sebelum menyimpan pengaturan ini.</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Preset kecepatan">
          {BLAST_PRESET_ORDER.map((id) => {
            const p = BLAST_PRESETS[id];
            const selected = current === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selected ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.label}</span>
                  {p.warning ? <ShieldAlert className="size-4 text-destructive" /> : null}
                </div>
                <p className="mt-1 text-xs font-medium text-primary">{p.perMinute}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Aktif di form: <span className="font-medium text-foreground">{activePreset ? activePreset.label : "Kustom"}</span>
          {data?.updatedAt ? (
            <>
              {" "}· Terakhir disimpan {waktu(data.updatedAt)}
              {data.updatedBy ? ` oleh ${data.updatedBy}` : ""}
            </>
          ) : null}
        </p>

        {activePreset?.warning ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{activePreset.warning}</span>
          </div>
        ) : null}
      </Panel>

      <Panel title="Parameter" description="Mengubah angka di sini otomatis menjadi preset Kustom bila tidak sama dengan preset mana pun.">
<<<<<<< HEAD
        {(["mapan", "baru", "batas", "perangkat"] as const).map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group === "mapan"
                ? "Nomor mapan"
                : group === "baru"
                  ? "Nomor baru (pemanasan)"
                  : group === "batas"
                    ? "Batas per nomor"
                    : "Perangkat per nomor"}
=======
        {(["mapan", "baru", "batas"] as const).map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group === "mapan" ? "Nomor mapan" : group === "baru" ? "Nomor baru (pemanasan)" : "Batas per nomor"}
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {FIELDS.filter((f) => f.group === group).map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`speed-${f.key}`}>{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`speed-${f.key}`}
                      type="number"
                      inputMode="numeric"
                      min={SPEED_LIMITS[f.key].min}
                      max={SPEED_LIMITS[f.key].max}
                      value={Number.isFinite(values[f.key]) ? values[f.key] : ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">{f.unit}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          Mode kecepatan pilihan worker (Kilat, Brutal, Santai, Slow, Siput) tetap bisa <b>memperlambat</b>,
          tidak bisa lebih cepat dari batas di sini. Untuk kecepatan penuh, worker perlu memilih Kilat atau Brutal.
          Satu nomor hanya punya satu alur kirim, berapa pun sesi yang tertaut.
        </div>
      </Panel>

      <Panel title="Rem otomatis" description="Menurunkan preset satu tingkat bila koneksi perangkat sering terputus saat mengirim.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <Switch id="auto-brake" checked={autoBrake} onCheckedChange={setAutoBrake} />
            <div>
              <Label htmlFor="auto-brake">{autoBrake ? "Aktif" : "Mati"}</Label>
              <p className="text-xs text-muted-foreground">
                Brutal → Cepat → Normal → Slow. Jeda 15 menit antar pengereman. Tidak pernah menaikkan kecepatan.
              </p>
              {data?.autoBrakeLast ? (
                <p className="text-xs text-muted-foreground">Terakhir mengerem: {waktu(data.autoBrakeLast)}</p>
              ) : null}
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-56">
            <Label htmlFor="auto-brake-threshold">Ambang (koneksi terputus / 10 menit)</Label>
            <Input
              id="auto-brake-threshold"
              type="number"
              min={1}
              max={1000}
              value={threshold}
              onChange={(e) => setThreshold(Math.round(Number(e.target.value)))}
            />
          </div>
        </div>
      </Panel>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
        <Button
          variant="outline"
          disabled={!dirty || save.isPending}
          onClick={() => {
            if (!data) return;
            setValues(data.values);
            setAutoBrake(data.autoBrake);
            setThreshold(data.autoBrakeThreshold);
          }}
        >
          Batalkan perubahan
        </Button>
        <Button disabled={!dirty || Boolean(problem) || save.isPending} onClick={() => save.mutate()}>
          <Save className="mr-2 size-4" />
          {save.isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </>
  );
}
