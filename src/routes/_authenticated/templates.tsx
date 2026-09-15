import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Shuffle, Image as ImageIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { buildMessageBody, countSpintaxVariations, TEMPLATE_VARIABLES } from "@/lib/whatsapp";
import type { Template } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Template Pesan — WBlast" },
      { name: "description", content: "Buat dan kelola template pesan WhatsApp." },
      { property: "og:title", content: "Template Pesan — WBlast" },
      { property: "og:description", content: "Buat dan kelola templat pesan WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Templates,
});

const SAMPLE = { name: "Andi", phone: "628123456789", var1: "Gold", var2: "20%", var3: "Jakarta" };

function Templates() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("Template baru");
  const [content, setContent] = useState(
    "{Halo|Hai|Selamat pagi} {{name}}!\n\nPromo {{var2}} khusus member {{var1}} berlaku hari ini saja.",
  );
  const [hasMedia, setHasMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [previewSeed, setPreviewSeed] = useState(0);

  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Template[];
    },
  });

  const preview = useMemo(
    () => buildMessageBody(content, SAMPLE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, previewSeed],
  );
  const variations = countSpintaxVariations(content);

  const save = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const payload = {
        user_id: user.user!.id,
        name,
        content,
        has_media: hasMedia,
        media_url: hasMedia ? mediaUrl || null : null,
      };
      if (activeId) {
        const { error } = await supabase.from("templates").update(payload).eq("id", activeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("templates").insert(payload).select().single();
        if (error) throw error;
        setActiveId((data as Template).id);
      }
    },
    onSuccess: () => {
      toast.success("Template berhasil disimpan");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template berhasil dihapus");
      setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const load = (t: Template) => {
    setActiveId(t.id);
    setName(t.name);
    setContent(t.content);
    setHasMedia(t.has_media);
    setMediaUrl(t.media_url ?? "");
  };

  const insertTag = (tag: string) => setContent((c) => `${c}{{${tag}}}`);

  return (
    <>
      <PageHeader
        title="Template Pesan"
        description="Susun pesan dengan variabel dan spintax, lalu lihat pratinjau hasilnya di WhatsApp."
        action={
          <Button
            variant="outline"
            onClick={() => {
              setActiveId(null);
              setName("Template baru");
              setContent("");
            }}
          >
            <Plus className="mr-1 size-4" /> Baru
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Template tersimpan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-2 pb-3">
            {(templates ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => load(t)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeId === t.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="truncate">{t.name}</span>
                {activeId === t.id ? <Check className="size-3.5" /> : null}
              </button>
            ))}
            {templates?.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Belum ada templat.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nama templat</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-content">Pesan</Label>
              <Textarea
                id="t-content"
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="{Halo|Hai} {{name}}, ..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <Button key={v} size="sm" variant="secondary" onClick={() => insertTag(v)}>
                  {`{{${v}}}`}
                </Button>
              ))}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setContent((c) => `${c}{Halo|Hai|Selamat pagi}`)}
              >
                <Shuffle className="mr-1 size-3.5" /> Spintax
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm">
                <ImageIcon className="size-4 text-muted-foreground" /> Lampirkan media
              </div>
              <Switch checked={hasMedia} onCheckedChange={setHasMedia} />
            </div>
            {hasMedia ? (
              <Input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/banner.jpg"
              />
            ) : null}

            <div className="flex items-center gap-2">
              <Button onClick={() => save.mutate()}>
                <Save className="mr-1 size-4" /> Simpan templat
              </Button>
              {activeId ? (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => remove.mutate(activeId)}
                >
                  <Trash2 className="mr-1 size-4" /> Hapus
                </Button>
              ) : null}
              <Badge variant="outline" className="ml-auto">
                {variations} variasi
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Pratinjau langsung</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setPreviewSeed((s) => s + 1)}>
              <Shuffle className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border bg-chat-canvas p-3">
              <div className="mx-auto max-w-[260px] space-y-2 py-4">
                {hasMedia ? (
                  <div className="ml-auto flex h-28 w-[85%] items-center justify-center rounded-xl bg-chat-bubble text-xs text-foreground/70">
                    <ImageIcon className="mr-1 size-4" /> lampiran media
                  </div>
                ) : null}
                <div className="ml-auto w-[90%] rounded-xl rounded-tr-sm bg-chat-bubble px-3 py-2 text-sm whitespace-pre-wrap text-foreground shadow-sm">
                  {preview || "Pratinjau pesan Anda akan muncul di sini."}
                  <div className="mt-1 text-right text-[10px] text-foreground/50">
                    {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} ✓✓
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Pratinjau memakai data contoh: {SAMPLE.name}, {SAMPLE.var1}, {SAMPLE.var2}.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
