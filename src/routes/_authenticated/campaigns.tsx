import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Pause, Square, Plus, ChevronLeft, ChevronRight, Rocket, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { dispatchCampaign } from "@/lib/api-client";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildMessageBody } from "@/lib/whatsapp";
import type { Campaign, ContactGroup, Template, WaSession } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Kampanye Broadcast — AAWB" },
      { name: "description", content: "Buat dan pantau kampanye broadcast WhatsApp." },
      { property: "og:title", content: "Kampanye Broadcast — AAWB" },
      { property: "og:description", content: "Buat dan pantau kampanye broadcast WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Campaigns,
});

const STEPS = ["Pengirim", "Penerima", "Pesan", "Keamanan"] as const;

const SPEED_OPTIONS = [
  { value: "kilat", label: "Kilat", description: "Real-time, hampir tanpa jeda (tercepat)", min: 1, max: 1 },
  { value: "brutal", label: "Brutal", description: "1–3 detik", min: 1, max: 3 },
  { value: "santai", label: "Santai", description: "4–6 detik", min: 4, max: 6 },
  { value: "slow", label: "Slow", description: "15–20 detik", min: 15, max: 20 },
  { value: "siput", label: "Siput", description: "30–50 detik", min: 30, max: 50 },
] as const;

function Campaigns() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    name: "",
    session_id: "",
    group_id: "all",
    template_id: "",
    min_delay: 4,
    max_delay: 6,
    
    scheduled_at: "",
  });

  const { data: sessions } = useQuery({
    queryKey: ["wa-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("wa_sessions").select("*").order("created_at");
      return (data ?? []) as WaSession[];
    },
  });
  const { data: groups } = useQuery({
    queryKey: ["contact-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("contact_groups").select("*").order("name");
      return (data ?? []) as ContactGroup[];
    },
  });
  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data } = await supabase.from("templates").select("*").order("created_at");
      return (data ?? []) as Template[];
    },
  });
  const [tickNotes, setTickNotes] = useState<Record<string, string | null>>({});
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],

    refetchInterval: 6000,
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Campaign[];
    },
  });
  const { data: progress } = useQuery({
    queryKey: ["campaign-progress"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("message_queue").select("campaign_id,status").limit(2000);
      const map: Record<string, { sent: number; failed: number; total: number }> = {};
      (data ?? []).forEach((r) => {
        const entry = (map[r.campaign_id] ??= { sent: 0, failed: 0, total: 0 });
        entry.total += 1;
        if (r.status === "sent") entry.sent += 1;
        if (r.status === "failed") entry.failed += 1;
      });
      return map;
    },
  });

  // Worker tick: drives running campaigns through the dispatcher without any
  // automatic pausing. Ticks run back-to-back so the queue keeps draining from
  // the first message to the last; only the campaign's own speed setting paces
  // the sending. A device disconnect never stops the campaign.
  useEffect(() => {
    const runningIds = (campaigns ?? []).filter((c) => c.status === "running").map((c) => c.id);
    if (!runningIds.length) return;
    let cancelled = false;

    const loop = async () => {
      while (!cancelled) {
        for (const id of runningIds) {
          if (cancelled) return;
          try {
            const tick = await dispatchCampaign({ campaign_id: id, action: "process" });
            setTickNotes((prev) => ({ ...prev, [id]: tick.error ?? null }));
          } catch (err) {
            setTickNotes((prev) => ({
              ...prev,
              [id]: err instanceof Error ? err.message : "Pengiriman tidak dapat dijalankan",
            }));
          }
        }
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    };
    void loop();

    return () => {
      cancelled = true;
    };
  }, [campaigns, queryClient]);



  const create = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.user!.id,
          name: draft.name || "Kampanye tanpa judul",
          session_id: draft.session_id || null,
          group_id: draft.group_id === "all" ? null : draft.group_id,
          template_id: draft.template_id || null,
          min_delay: draft.min_delay,
          max_delay: draft.max_delay,
          batch_limit: 100000,
          scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: async (campaign) => {
      setOpen(false);
      setStep(0);
      const res = await dispatchCampaign({ campaign_id: campaign.id, action: "enqueue" });
      toast.success(`Kampanye dibuat — ${res.queued ?? 0} pesan masuk antrean`);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const control = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" | "abort" | "retry" }) =>
      dispatchCampaign({ campaign_id: id, action }),
    onSuccess: (_res, vars) => {
      if (vars.action === "retry") toast.success("Pesan yang gagal dimasukkan kembali ke antrean");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: queueError } = await supabase
        .from("message_queue")
        .delete()
        .eq("campaign_id", id);
      if (queueError) throw queueError;
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kampanye dihapus");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-progress"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedTemplate = templates?.find((t) => t.id === draft.template_id);
  const selectedSpeed =
    SPEED_OPTIONS.find(
      (option) => option.min === draft.min_delay && option.max === draft.max_delay,
    )?.value ?? "santai";

  return (
    <>
      <PageHeader
        title="Kampanye Broadcast"
        description="Buat broadcast dalam empat langkah dengan jeda pengiriman yang aman."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" /> Kampanye baru
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {(campaigns ?? []).map((c) => {
          const p = progress?.[c.id] ?? { sent: 0, failed: 0, total: c.total_targets };
          const pct = p.total ? Math.round(((p.sent + p.failed) / p.total) * 100) : 0;
          return (
            <Card key={c.id}>
              <CardHeader className="flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.total_targets} penerima · {c.min_delay}–{c.max_delay} dtk jeda
                    {c.scheduled_at
                      ? ` · dijadwalkan ${new Date(c.scheduled_at).toLocaleString("id-ID")}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </CardHeader>
              <CardContent>
                <Progress value={pct} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.sent} terkirim · {p.failed} gagal · {Math.max(0, p.total - p.sent - p.failed)} tersisa
                </p>
                {c.status === "running" && tickNotes[c.id] ? (
                  <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                    {tickNotes[c.id]}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={c.status === "running" || c.status === "completed"}
                    onClick={() => control.mutate({ id: c.id, action: "resume" })}
                  >
                    <Play className="mr-1 size-3.5" /> Mulai
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={c.status !== "running"}
                    onClick={() => control.mutate({ id: c.id, action: "pause" })}
                  >
                    <Pause className="mr-1 size-3.5" /> Jeda
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={c.status === "completed"}
                    onClick={() => control.mutate({ id: c.id, action: "abort" })}
                  >
                    <Square className="mr-1 size-3.5" /> Batalkan
                  </Button>
                  {p.failed > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => control.mutate({ id: c.id, action: "retry" })}
                    >
                      <RotateCcw className="mr-1 size-3.5" /> Kirim ulang gagal
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={c.status === "running" || remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Hapus kampanye "${c.name}" beserta antrean pesannya?`)) {
                        remove.mutate(c.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-1 size-3.5" /> Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {campaigns?.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Belum ada kampanye — buat broadcast pertama Anda.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Kampanye broadcast baru</DialogTitle>
            <DialogDescription>
              Langkah {step + 1} dari {STEPS.length}: {STEPS[step]}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2 flex gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>

          {step === 0 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-name">Nama kampanye</Label>
                <Input
                  id="cp-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Promo September"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Perangkat pengirim</Label>
                <Select
                  value={draft.session_id}
                  onValueChange={(v) => setDraft({ ...draft, session_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih perangkat yang terhubung" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sessions ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.session_name} — {s.status === "connected" ? "terhubung" : "tidak terhubung"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-1.5">
              <Label>Target penerima</Label>
              <Select
                value={draft.group_id}
                onValueChange={(v) => setDraft({ ...draft, group_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua kontak</SelectItem>
                  {(groups ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Semua kontak pada daftar penerima ini akan dikirimi pesan.
              </p>

            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Template pesan</Label>
                <Select
                  value={draft.template_id}
                  onValueChange={(v) => setDraft({ ...draft, template_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih templat" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTemplate ? (
                <div className="rounded-xl bg-chat-canvas p-3">
                  <div className="ml-auto w-[90%] rounded-xl rounded-tr-sm bg-chat-bubble px-3 py-2 text-sm whitespace-pre-wrap">
                    {buildMessageBody(selectedTemplate.content, {
                      name: "Andi",
                      var1: "Gold",
                      var2: "20%",
                    })}
                  </div>
                  {selectedTemplate.has_media ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Lampiran media: {selectedTemplate.media_url ?? "belum tersedia"}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <Label>Pilih kecepatan blast</Label>
                <RadioGroup
                  value={selectedSpeed}
                  onValueChange={(value) => {
                    const option = SPEED_OPTIONS.find((item) => item.value === value);
                    if (!option) return;
                    setDraft({ ...draft, min_delay: option.min, max_delay: option.max });
                  }}
                  className="gap-2"
                >
                  {SPEED_OPTIONS.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`speed-${option.value}`}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem id={`speed-${option.value}`} value={option.value} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-5">{option.label}</span>
                        <span className="block text-xs font-normal leading-5 text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>


              <div className="space-y-1.5">
                <Label htmlFor="cp-sched">Jadwal mulai (opsional)</Label>
                <Input
                  id="cp-sched"
                  type="datetime-local"
                  value={draft.scheduled_at}
                  onChange={(e) => setDraft({ ...draft, scheduled_at: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2 flex-row justify-between sm:justify-between">
            <Button
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="mr-1 size-4" /> Kembali
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Berikutnya <ChevronRight className="ml-1 size-4" />
              </Button>
            ) : (
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Rocket className="mr-1 size-4" /> Jalankan kampanye
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
