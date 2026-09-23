/**
 * Monitor Blast: kondisi pengiriman secara langsung — kecepatan, blaster aktif, galat,
 * status sesi gateway, dan diagnosis otomatis. Semua angka dari satu fungsi database
 * (admin_blast_monitor) supaya ringan; diperbarui tiap 30 detik.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Snowflake,
  Unplug,
  Users,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  TableShell,
  Td,
  Th,
  angka,
} from "@/components/admin-ui";
import { cn } from "@/lib/utils";
import { getBlastMonitor, type BlastMonitor, type BlastMonitorBlaster } from "@/lib/blast-control.functions";
<<<<<<< HEAD
import { WorkerDetailDialog, type WorkerDialogTarget } from "@/components/WorkerDetailDialog";
import { BLAST_PRESETS, isBlastPresetId } from "@/lib/blast-presets";


=======
import { BLAST_PRESETS, isBlastPresetId } from "@/lib/blast-presets";

>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
export const Route = createFileRoute("/_authenticated/admin/monitor")({
  head: () => ({
    meta: [
      { title: "Monitor Blast — NAROWA" },
      { name: "description", content: "Pantau kecepatan, blaster aktif, dan kendala pengiriman secara langsung." },
    ],
  }),
  component: MonitorPage,
});

function jam(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function sejak(value: string | null | undefined, now: number): string {
  if (!value) return "—";
  const menit = Math.round((now - new Date(value).getTime()) / 60_000);
  if (menit <= 0) return "baru saja";
  if (menit < 60) return `${menit} mnt lalu`;
  return `${Math.floor(menit / 60)} j ${menit % 60} mnt lalu`;
}

type Tone = "ok" | "warn" | "bad";
interface Finding {
  tone: Tone;
  text: string;
}

/** Diagnosis dalam bahasa biasa, dari aturan yang dipakai saat menangani blast 21–22 Sep. */
function diagnose(d: BlastMonitor): Finding[] {
  const out: Finding[] = [];
  const e = d.errors ?? {};
  const t = d.totals;
  const working = d.gateway?.["WORKING"] ?? null;

  if (!d.campaigns.length) {
    out.push({ tone: "warn", text: "Tidak ada kampanye berstatus berjalan." });
    return out;
  }
  if (t.pending === 0) {
    out.push({ tone: "ok", text: "Antrean kampanye berjalan sudah habis." });
    return out;
  }
  if (d.devices.active_5m === 0) {
    out.push({
      tone: "bad",
      text:
        "Tidak ada perangkat yang aktif 5 menit terakhir padahal antrean masih ada. Cek cron NAROWA1 dan " +
        "log aplikasi; bila cron sukses tetapi tetap diam, jeda kampanye lalu restart aplikasi.",
    });
  } else if (d.devices.ready_db > d.devices.active_5m * 2 && d.devices.ready_db - d.devices.active_5m >= 5) {
    out.push({
      tone: "warn",
      text:
        `Dari ${d.devices.ready_db} perangkat siap di database, hanya ${d.devices.active_5m} yang aktif 5 menit ` +
        "terakhir. Sebagian kemungkinan sedang ditahan WhatsApp, terputus (status database tertinggal), " +
        "atau putaran pengirim tersangkut.",
    });
  }
  if ((e.terputus ?? 0) > 20) {
    out.push({
      tone: "bad",
      text:
        `${e.terputus} kali koneksi terputus saat mengirim dalam 30 menit. WhatsApp menolak laju ini — ` +
        "turunkan preset kecepatan (atau aktifkan rem otomatis).",
    });
  }
  if ((e.ditolak_mapan ?? 0) > 5) {
    out.push({
      tone: "bad",
      text: `${e.ditolak_mapan} penolakan (463) pada nomor MAPAN dalam 30 menit. Tanda laju terlalu tinggi.`,
    });
  }
  if ((e.ditolak_463 ?? 0) > Math.max(10, t.sent_10m)) {
    out.push({
      tone: "warn",
      text:
        `${e.ditolak_463} penolakan 463 dalam 30 menit, kebanyakan dari nomor baru. Nomor baru dibatasi ` +
        "WhatsApp saat menghubungi orang asing; pengaturan kecepatan tidak bisa menembus batas ini.",
    });
  }
  if (d.report.mapan_aktif <= 1 && d.devices.active_5m > 0) {
    out.push({
      tone: "warn",
      text:
        `Hanya ${d.report.mapan_aktif} nomor mapan yang aktif. Kecepatan total dibatasi jumlah nomor mapan, ` +
        "bukan pengaturan. Ajak worker dengan nomor lama untuk online dan memilih mode Kilat/Brutal.",
    });
  }
  if (working !== null && working < d.devices.ready_unique_phones / 2) {
    out.push({
      tone: "warn",
      text: `Gateway hanya punya ${working} sesi WORKING, lebih sedikit dari perangkat siap di database.`,
    });
  }
  if (!out.length) out.push({ tone: "ok", text: "Pengiriman berjalan normal." });
  return out;
}

function statusOf(b: BlastMonitorBlaster, now: number): { label: string; tone: Tone } {
  if (b.cooldown_until && new Date(b.cooldown_until).getTime() > now) return { label: "Didinginkan", tone: "warn" };
  if (b.device_status && b.device_status !== "connected") return { label: "Terputus", tone: "bad" };
  if (b.blast_ready === false) return { label: "Start mati", tone: "warn" };
  if (b.last_sent && now - new Date(b.last_sent).getTime() < 3 * 60_000) return { label: "Aktif", tone: "ok" };
  return { label: "Diam", tone: "warn" };
}

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  warn: "border-warning/40 bg-warning/10 text-warning",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
};

const BLASTER_PER_PAGE = 20;

function MonitorPage() {
  const fetchMonitor = useServerFn(getBlastMonitor);
  const { data, isFetching, refetch, error, dataUpdatedAt } = useQuery({
    queryKey: ["blast-monitor"],
    queryFn: () => fetchMonitor(),
    refetchInterval: 30_000,
  });

  const now = data ? new Date(data.now).getTime() : Date.now();

  return (
    <>
      <AdminPageTitle
        title="Monitor Blast"
        description="Kecepatan, blaster aktif, dan kendala pengiriman. Diperbarui otomatis tiap 30 detik."
        action={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/pengaturan">
                <Gauge className="mr-2 size-4" />
                Atur kecepatan
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
          </>
        }
      />

      {error ? (
        <Panel>
          <EmptyState title="Monitor gagal dimuat" description={(error as Error).message} />
        </Panel>
      ) : !data ? (
        <Panel>
          <EmptyState title="Memuat…" />
        </Panel>
      ) : (
        <MonitorBody data={data} now={now} updatedAt={dataUpdatedAt} />
      )}
    </>
  );
}

function MonitorBody({ data, now, updatedAt }: { data: BlastMonitor; now: number; updatedAt: number }) {
<<<<<<< HEAD
  const [workerTarget, setWorkerTarget] = useState<WorkerDialogTarget | null>(null);
  const [blasterPageRaw, setBlasterPage] = useState(0);

=======
  const [blasterPageRaw, setBlasterPage] = useState(0);
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
  const blasterTotal = data.blasters.length;
  const blasterTotalPages = Math.max(1, Math.ceil(blasterTotal / BLASTER_PER_PAGE));
  const blasterPage = Math.min(blasterPageRaw, blasterTotalPages - 1);
  const blasterRows = data.blasters.slice(blasterPage * BLASTER_PER_PAGE, (blasterPage + 1) * BLASTER_PER_PAGE);
  const t = data.totals;
  const e = data.errors ?? {};
  const findings = diagnose(data);
  const perMinute10 = t.sent_10m / 10;
  const etaHours = t.sent_60m > 0 ? t.pending / t.sent_60m : null;
  const preset = isBlastPresetId(data.settings.preset) ? BLAST_PRESETS[data.settings.preset].label : "Kustom";
  const warm = data.settings.warmup_count;
  const chart = data.minutes.map((m) => ({ menit: jam(m.m), terkirim: m.sent, blaster: m.senders }));

  return (
    <div className="space-y-4">
      <Panel title="Diagnosis" description={`Data pukul ${jam(new Date(updatedAt).toISOString())}`}>
        <ul className="space-y-2">
          {findings.map((f, i) => (
            <li key={i} className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", TONE_CLASS[f.tone])}>
              {f.tone === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : f.tone === "warn" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              ) : (
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              )}
              <span className="text-foreground">{f.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Pesan / menit" value={perMinute10.toFixed(1)} hint="Rata-rata 10 menit terakhir" icon={Activity} />
        <StatTile label="Terkirim 1 jam" value={angka(t.sent_60m)} hint={`${angka(t.sent_10m)} dalam 10 menit`} icon={Send} tone="success" />
        <StatTile
          label="Blaster aktif"
          value={angka(t.senders_10m)}
          hint={`${data.report.mapan_aktif} mapan · ${data.report.pemanasan_aktif} pemanasan (15 mnt)`}
          icon={Users}
          tone="info"
        />
        <StatTile
          label="Sisa antrean"
          value={angka(t.pending)}
          hint={etaHours === null ? "Perkiraan selesai: —" : `Perkiraan selesai ±${etaHours < 1 ? `${Math.round(etaHours * 60)} menit` : `${etaHours.toFixed(1)} jam`}`}
          icon={Clock}
          tone="warning"
        />
        <StatTile
          label="Perangkat siap"
          value={angka(data.devices.ready_db)}
          hint={`${data.devices.active_5m} aktif 5 menit terakhir`}
          icon={Smartphone}
        />
        <StatTile label="Didinginkan" value={angka(data.devices.cooling)} hint="Pemutus sirkuit" icon={Snowflake} tone="muted" />
        <StatTile
          label="Koneksi terputus"
          value={angka(e.terputus ?? 0)}
          hint="Saat mengirim, 30 menit"
          icon={Unplug}
          tone={(e.terputus ?? 0) > 20 ? "danger" : "muted"}
        />
        <StatTile
          label="Ditolak WhatsApp (463)"
          value={angka(e.ditolak_463 ?? 0)}
          hint={`${e.ditolak_mapan ?? 0} dari nomor mapan · 30 menit`}
          icon={ShieldAlert}
          tone={(e.ditolak_mapan ?? 0) > 5 ? "danger" : "muted"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Terkirim per menit" description="60 menit terakhir — batang: pesan, garis: blaster aktif">
          {chart.length ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="menit" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="terkirim" name="Terkirim" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  <Line dataKey="blaster" name="Blaster" type="monotone" stroke="var(--info)" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Belum ada pesan terkirim dalam 60 menit terakhir" />
          )}
        </Panel>

        <Panel title="Pengaturan aktif" description="Ubah di Pengaturan › Kecepatan Blast">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Preset</dt>
            <dd className="font-medium">{preset}</dd>
            <dt className="text-muted-foreground">Jeda nomor mapan</dt>
            <dd className="font-medium">
              {data.settings.min_delay_sec ?? "—"}–{data.settings.max_delay_sec ?? "—"} dtk
            </dd>
            <dt className="text-muted-foreground">Batas per jam</dt>
            <dd className="font-medium">{data.settings.hourly_cap ?? "—"}</dd>
            <dt className="text-muted-foreground">Batas per hari</dt>
            <dd className="font-medium">{data.settings.daily_cap === 0 ? "Tanpa batas" : (data.settings.daily_cap ?? "—")}</dd>
            <dt className="text-muted-foreground">Ambang mapan</dt>
            <dd className="font-medium">{warm} pesan</dd>
            <dt className="text-muted-foreground">Rem otomatis</dt>
            <dd className="font-medium">{data.settings.auto_brake ? "Aktif" : "Mati"}</dd>
            <dt className="text-muted-foreground">Rata-rata mapan</dt>
            <dd className="font-medium">{data.report.rata_mapan_per_menit ?? "—"} /mnt</dd>
            <dt className="text-muted-foreground">Rata-rata pemanasan</dt>
            <dd className="font-medium">{data.report.rata_pemanasan_per_menit ?? "—"} /mnt</dd>
          </dl>
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sesi di gateway</p>
            {data.gateway ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.gateway)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, n]) => (
                    <Badge key={status} variant={status === "WORKING" ? "default" : "secondary"}>
                      {status}: {angka(n)}
                    </Badge>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Tidak terbaca: {data.gatewayError ?? "—"}</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Blaster 60 menit terakhir" description="Median = jarak khas antar pesan saat nomor aktif">
        {data.blasters.length ? (
          <>
            <TableShell className="min-w-[860px]">
              <thead className="border-b">
                <tr>
                  <Th>Nomor</Th>
                  <Th>Worker</Th>
                  <Th>Mode</Th>
                  <Th>Golongan</Th>
                  <Th className="text-right">10 mnt</Th>
                  <Th className="text-right">1 jam</Th>
                  <Th className="text-right">Median</Th>
                  <Th>Terakhir kirim</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {blasterRows.map((b) => {
                  const st = statusOf(b, now);
                  const mapan = b.total_sent >= warm;
<<<<<<< HEAD
                  const clickable = Boolean(b.worker_id);
                  return (
                    <tr
                      key={b.phone}
                      className={clickable ? "cursor-pointer transition-colors hover:bg-muted/50" : undefined}
                      title={clickable ? "Klik untuk detail worker & kendali" : "Pemilik nomor tidak ditemukan"}
                      onClick={
                        clickable
                          ? () =>
                              setWorkerTarget({
                                workerId: b.worker_id as string,
                                sessionId: b.session_id ?? null,
                                phone: b.phone,
                              })
                          : undefined
                      }
                    >
=======
                  return (
                    <tr key={b.phone}>
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
                      <Td className="font-mono text-xs">{b.phone}</Td>
                      <Td className="max-w-[160px] truncate">{b.worker || "—"}</Td>
                      <Td>{b.mode ?? "—"}</Td>
                      <Td>
                        <span className={mapan ? "text-success" : "text-muted-foreground"}>
                          {mapan ? "Mapan" : "Pemanasan"}
                        </span>
                        <span className="ml-1 text-xs text-muted-foreground">({angka(b.total_sent)})</span>
                      </Td>
                      <Td className="text-right">{angka(b.sent_10m)}</Td>
                      <Td className="text-right">{angka(b.sent_60m)}</Td>
                      <Td className="text-right">{b.median_sec === null ? "—" : `${b.median_sec} dtk`}</Td>
                      <Td className="whitespace-nowrap text-xs">{sejak(b.last_sent, now)}</Td>
                      <Td>
                        <span className={cn("rounded-md border px-2 py-0.5 text-xs", TONE_CLASS[st.tone])}>{st.label}</span>
                      </Td>
                    </tr>
                  );
                })}
<<<<<<< HEAD

=======
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
              </tbody>
            </TableShell>
            {blasterTotalPages > 1 && (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Menampilkan {blasterPage * BLASTER_PER_PAGE + 1}–{Math.min((blasterPage + 1) * BLASTER_PER_PAGE, blasterTotal)} dari {angka(blasterTotal)} blaster
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={blasterPage === 0}
                    onClick={() => setBlasterPage(blasterPage - 1)}
                  >
                    Sebelumnya
                  </Button>
                  <span className="whitespace-nowrap">
                    Halaman {blasterPage + 1} / {blasterTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={blasterPage >= blasterTotalPages - 1}
                    onClick={() => setBlasterPage(blasterPage + 1)}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState title="Belum ada blaster yang mengirim dalam 60 menit terakhir" />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Galat 30 menit terakhir" description="Perkiraan dari pesan yang dijadwalkan ulang atau ditandai">
          <ul className="space-y-1.5 text-sm">
            {(
              [
                ["terputus", "Koneksi terputus saat mengirim"],
                ["belum_siap", "Perangkat belum siap"],
                ["ditolak_463", "Ditolak WhatsApp (463)"],
                ["ditahan", "Nomor dibatasi / ditahan WhatsApp"],
                ["tidak_pasti", "Tidak pasti (tanpa konfirmasi)"],
                ["gateway", "Kesalahan gateway"],
                ["lainnya", "Lainnya"],
              ] as const
            ).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{angka(e[key] ?? 0)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Sedang diproses: {angka(t.processing)} · Menunggu kirim ulang: {angka(t.retrying)}
          </p>
        </Panel>

        <Panel title="Kampanye berjalan">
          {data.campaigns.length ? (
            <ul className="space-y-2 text-sm">
              {data.campaigns.map((c) => {
                const total = c.pending + c.sent + c.failed;
                const pct = total ? Math.round((c.sent / total) * 100) : 0;
                return (
                  <li key={c.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {angka(c.sent)} terkirim · {angka(c.failed)} gagal · {angka(c.pending)} sisa
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Tidak ada kampanye berjalan" />
          )}
        </Panel>
      </div>
<<<<<<< HEAD

      <WorkerDetailDialog target={workerTarget} onClose={() => setWorkerTarget(null)} />
    </div>
  );
}

=======
    </div>
  );
}
>>>>>>> 0560bd73f2ccc9a55033f7e79d0c44d555aee2ba
