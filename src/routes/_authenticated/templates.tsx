import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Save,
  Trash2,
  Shuffle,
  Image as ImageIcon,
  Check,
  Link2,
  Paperclip,
  MousePointerClick,
  X,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  BUTTON_TOKEN_PATTERN,
  buildMessageBody,
  buttonToken,
  countSpintaxVariations,
  parseMessageParts,
} from "@/lib/whatsapp";
import type { MediaType, Template, TemplateButton } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Template Pesan — NAROWA" },
      { name: "description", content: "Buat template WhatsApp dengan media, emoji, dan tombol." },
      { property: "og:title", content: "Template Pesan — NAROWA" },
      {
        property: "og:description",
        content: "Buat template WhatsApp dengan media, emoji, dan tombol tautan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Templates,
});

const SAMPLE = { name: "Andi", phone: "628123456789" };

const MEDIA_TYPES: Array<{ value: MediaType; label: string }> = [
  { value: "image", label: "Gambar" },
  { value: "document", label: "Dokumen / File" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio / Voice note" },
];

function Templates() {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("Template baru");
  const [content, setContent] = useState("Halo {{name}}!\n\nPromo spesial berlaku hari ini saja.");
  const [hasMedia, setHasMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [mediaFilename, setMediaFilename] = useState("");
  const [footerText, setFooterText] = useState("");
  
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
  const previewParts = useMemo(
    () =>
      parseMessageParts(preview)
        .map((p) => (p.kind === "text" ? { ...p, text: p.text.trim() } : p))
        .filter((p) => (p.kind === "text" ? p.text.length > 0 : true)),
    [preview],
  );
  const variations = countSpintaxVariations(content);


  const save = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      // Tombol kini tersimpan sebagai token di dalam isi pesan.
      const cleanButtons: TemplateButton[] = [];

      const payload = {
        user_id: user.user!.id,
        name,
        content,
        has_media: hasMedia,
        media_url: hasMedia ? mediaUrl || null : null,
        media_type: hasMedia ? mediaType : "text",
        media_filename: hasMedia && mediaFilename ? mediaFilename : null,
        footer_text: footerText || null,
        buttons_json: cleanButtons,
      };
      // Columns added by db/migrations/002_rich_templates.sql are not in the
      // generated types yet, so the payload is passed through untyped.
      const row = payload as never;
      if (activeId) {
        const { error } = await supabase.from("templates").update(row).eq("id", activeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("templates").insert(row).select().single();
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
    // Templat lama menyimpan tombol terpisah; ubah jadi token di akhir pesan.
    const legacy = (Array.isArray(t.buttons_json) ? t.buttons_json : []).filter(
      (b) => b?.text && b?.url,
    );
    setContent(
      legacy.length
        ? `${t.content}\n\n${legacy.map((b) => buttonToken(b.text, b.url)).join("\n")}`
        : t.content,
    );
    setHasMedia(t.has_media);
    setMediaUrl(t.media_url ?? "");
    setMediaType(t.media_type && t.media_type !== "text" ? t.media_type : "image");
    setMediaFilename(t.media_filename ?? "");
    setFooterText(t.footer_text ?? "");
  };


  /** Insert text where the cursor is, keeping focus in the message box. */
  const insertAtCursor = (snippet: string) => {
    const el = contentRef.current;
    if (!el) {
      setContent((c) => c + snippet);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? start;
    const next = content.slice(0, start) + snippet + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  /** Tombol klik hidup di dalam teks pesan, jadi posisinya ditentukan penulis. */
  const inlineButtons = useMemo(() => {
    const out: TemplateButton[] = [];
    const re = new RegExp(BUTTON_TOKEN_PATTERN.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) out.push({ text: m[1] ?? "", url: m[2] ?? "" });
    return out;
  }, [content]);

  const rewriteToken = (index: number, replacement: string) => {
    const re = new RegExp(BUTTON_TOKEN_PATTERN.source, "gi");
    let i = 0;
    setContent(content.replace(re, (match) => (i++ === index ? replacement : match)));
  };

  const updateInlineButton = (index: number, patch: Partial<TemplateButton>) => {
    const current = inlineButtons[index];
    if (!current) return;
    const next = { ...current, ...patch };
    rewriteToken(index, buttonToken(next.text.replace(/[|\]]/g, ""), next.url.replace(/[\]]/g, "")));
  };

  const removeInlineButton = (index: number) => rewriteToken(index, "");

  const addButton = () => {
    if (inlineButtons.length >= 3) {
      toast.error("WhatsApp membatasi maksimal 3 tombol per pesan.");
      return;
    }
    insertAtCursor(`\n${buttonToken("Klik di sini", "https://")}\n`);
  };


  return (
    <>
      <PageHeader
        title="Template Pesan"
        description="Susun pesan dengan variabel, emoji, media, dan tombol tautan, lalu lihat pratinjaunya."
        action={
          <Button
            variant="outline"
            onClick={() => {
              setActiveId(null);
              setName("Template baru");
              setContent("");
              setHasMedia(false);
              setMediaUrl("");
              setMediaFilename("");
              setFooterText("");
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
                ref={contentRef}
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="{Halo|Hai} {{name}}, ..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {["name", "phone"].map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant="secondary"
                  onClick={() => insertAtCursor(`{{${v}}}`)}
                >
                  {`{{${v}}}`}
                </Button>
              ))}
              <EmojiPicker onSelect={(emoji) => insertAtCursor(emoji)} />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => insertAtCursor("https://")}
              >
                <Link2 className="mr-1 size-3.5" /> Tautan
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 text-muted-foreground" /> Lampirkan media
                </div>
                <Switch checked={hasMedia} onCheckedChange={setHasMedia} />
              </div>
              {hasMedia ? (
                <div className="space-y-2 pt-1">
                  <Select value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIA_TYPES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://example.com/banner.jpg"
                  />
                  {mediaType === "document" ? (
                    <Input
                      value={mediaFilename}
                      onChange={(e) => setMediaFilename(e.target.value)}
                      placeholder="Nama file yang tampil, mis. Katalog-2026.pdf"
                    />
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Tempel URL file yang bisa diakses publik.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <MousePointerClick className="size-4 text-muted-foreground" /> Tombol klik
                </div>
                <Button size="sm" variant="secondary" onClick={addButton}>
                  <Plus className="mr-1 size-3.5" /> Tambah tombol klik
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tombol disisipkan langsung di kolom Pesan pada posisi kursor, jadi Anda bebas
                menaruhnya setelah teks mana pun.
              </p>
              {inlineButtons.map((b, i) => (
                <div key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <Input
                    value={b.text}
                    onChange={(e) => updateInlineButton(i, { text: e.target.value })}
                    placeholder="Contoh: Klik untuk klaim"
                    className="w-full sm:w-40"
                  />
                  <Input
                    value={b.url}
                    onChange={(e) => updateInlineButton(i, { url: e.target.value })}
                    placeholder="Tautan tujuan, contoh: https://tokosaya.com/promo"
                  />
                  <Button size="icon" variant="ghost" onClick={() => removeInlineButton(i)}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              {inlineButtons.length ? (
                <div className="space-y-2">
                  <Label htmlFor="t-footer" className="text-xs">
                    Teks footer (opsional)
                  </Label>
                  <Input
                    id="t-footer"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Balas STOP untuk berhenti"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tombol dikirim sebagai tombol asli WhatsApp bila perangkat/gateway
                    mendukungnya. Jika tidak, tautan tetap muncul di posisi yang sama.
                  </p>
                </div>
              ) : null}
            </div>


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
                    <ImageIcon className="mr-1 size-4" />{" "}
                    {MEDIA_TYPES.find((m) => m.value === mediaType)?.label ?? "lampiran"}
                  </div>
                ) : null}
                {previewParts.length === 0 ? (
                  <div className="ml-auto w-[90%] rounded-xl rounded-tr-sm bg-chat-bubble px-3 py-2 text-sm text-foreground shadow-sm">
                    Pratinjau pesan Anda akan muncul di sini.
                  </div>
                ) : null}
                {previewParts.map((part, i) =>
                  part.kind === "button" ? (
                    <div
                      key={i}
                      className="ml-auto flex w-[90%] items-center justify-center gap-2 rounded-xl bg-chat-bubble px-3 py-2 text-center text-sm font-medium text-primary shadow-sm"
                    >
                      <MousePointerClick className="size-4" /> {part.text || "Tombol"}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="ml-auto w-[90%] rounded-xl rounded-tr-sm bg-chat-bubble px-3 py-2 text-sm whitespace-pre-wrap text-foreground shadow-sm"
                    >
                      {part.text}
                    </div>
                  ),
                )}
                {footerText ? (
                  <div className="ml-auto w-[90%] px-1 text-[11px] text-foreground/50">
                    {footerText}
                  </div>
                ) : null}

              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Pratinjau memakai data contoh: {SAMPLE.name}, {SAMPLE.phone}.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
