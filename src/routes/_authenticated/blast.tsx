import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Play, Square, Smartphone, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getBlastState, setBlastState } from "@/lib/blast.functions";
import { blastTick } from "@/lib/api-client";
import { BLAST_SPEEDS } from "@/lib/blast-speed";
import { rupiah } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/blast")({
  head: () => ({
    meta: [
      { title: "Mulai Blast — AAWB" },
      { name: "description", content: "Pilih kecepatan blast dan jalankan pengiriman dari perangkat Anda." },
      { property: "og:title", content: "Mulai Blast — AAWB" },
      { property: "og:description", content: "Pilih kecepatan blast dan jalankan pengiriman dari perangkat Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlastPage,
});

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Play;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-lg bg-accent p-2 text-accent-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-lg font-semibold">{value}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function BlastPage() {
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getBlastState);
  const saveState = useServerFn(setBlastState);
  const [speed, setSpeed] = useState<string>("santai");
  const [notes, setNotes] = useState<Record<string, string | null>>({});
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const { data: state } = useQuery({
    queryKey: ["blast-state"],
    queryFn: () => fetchState(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (state?.speed) setSpeed(state.speed);
  }, [state?.speed]);

  const running = Boolean(state?.running);
  const devices = state?.devices ?? [];
  const connected = devices.filter((d) => d.status === "connected");

  const toggle = useMutation({
    mutationFn: (next: boolean) => saveState({ data: { running: next, speed } }),
    onSuccess: (_res, next) => {
      toast.success(next ? "Blast dijalankan" : "Blast dihentikan");
      queryClient.invalidateQueries({ queryKey: ["blast-state"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Pekerja blast: selama status berjalan, setiap perangkat terhubung menarik
  // nomor dari kolam proyek admin lalu mengirimkannya.
  useEffect(() => {
    if (!running || connected.length === 0) return;
    const ids = connected.map((d) => d.id);
    let cancelled = false;

    const loop = async () => {
      while (!cancelled) {
        for (const id of ids) {
          if (cancelled) return;
          try {
            const tick = await blastTick(id);
            setNotes((prev) => ({ ...prev, [id]: tick.error ?? null }));
            if (!tick.running) {
              queryClient.invalidateQueries({ queryKey: ["blast-state"] });
              return;
            }
          } catch (err) {
            setNotes((prev) => ({
              ...prev,
              [id]: err instanceof Error ? err.message : "Pengiriman tidak dapat dijalankan",
            }));
          }
        }
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["blast-state"] });
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    };
    void loop();

    return () => {
      cancelled = true;
    };
  }, [running, connected.length, queryClient]);

  return (
    <>
      <PageHeader
        title="Mulai Blast"
        description="Hubungkan perangkat, pilih kecepatan, lalu tekan Start Blast."
        action={
          running ? (
            <Button variant="destructive" onClick={() => toggle.mutate(false)} disabled={toggle.isPending}>
              <Square className="mr-1 size-4" /> Stop Blast
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (connected.length === 0) {
                  toast.error("Hubungkan minimal satu perangkat terlebih dahulu.");
                  return;
                }
                toggle.mutate(true);
              }}
              disabled={toggle.isPending}
            >
              <Play className="mr-1 size-4" /> Start Blast
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Perangkat terhubung" value={`${connected.length}/${state?.max_devices ?? 4}`} icon={Smartphone} />
        <StatCard label="Pesan terkirim" value={String(state?.sent ?? 0)} icon={CheckCircle2} />
        <StatCard label="Pesan gagal" value={String(state?.failed ?? 0)} icon={XCircle} />
        <StatCard label="Saldo" value={rupiah(state?.balance ?? 0)} icon={Wallet} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Kecepatan blast</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={speed}
              onValueChange={(value) => {
                setSpeed(value);
                if (running) toggle.mutate(true);
              }}
              className="gap-2"
            >
              {BLAST_SPEEDS.map((option) => (
                <div
                  key={option.value}
                  className="rounded-md border border-border transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <Label
                    htmlFor={`spd-${option.value}`}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-accent/50"
                  >
                    <RadioGroupItem id={`spd-${option.value}`} value={option.value} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-5">{option.label}</span>
                      <span className="block text-xs font-normal leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="mt-3 text-xs text-muted-foreground">
              Sisa nomor yang tersedia untuk dikerjakan: {state?.pool_available ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Perangkat saya</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link to="/devices">Kelola perangkat</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {devices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada perangkat. Tambahkan maksimal {state?.max_devices ?? 4} perangkat di menu Perangkat.
              </p>
            ) : null}
            {devices.map((d) => (
              <div key={d.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{d.session_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {d.phone_number ?? "Nomor belum terdeteksi"}
                    </span>
                  </span>
                  <Badge variant={d.status === "connected" ? "default" : "outline"}>
                    {d.status === "connected" ? "Terhubung" : "Tidak terhubung"}
                  </Badge>
                </div>
                {notes[d.id] ? (
                  <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    {notes[d.id]}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
