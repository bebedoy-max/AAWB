/** Dialog "Rancang Kampanye": form kiri + pratinjau WhatsApp langsung di kanan. */
import { useEffect, useRef, useState } from "react";
import { Link2, Megaphone, Phone, Send, Upload, User, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CampaignDraft = {
  name: string;
  message: string;
  mediaUrl: string | null;
  ctaText: string;
  ctaUrl: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: CampaignDraft) => void;
  isPending?: boolean;
  /** Bagian tambahan (mis. impor nomor) yang ditampilkan di bawah form. */
  extra?: React.ReactNode;
  senderName?: string;
  /** Nilai awal saat mode edit; null/kosong untuk kampanye baru. */
  initial?: CampaignDraft | null;
};

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function CampaignComposer({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  extra,
  senderName = "AAWB",
  initial = null,
}: Props) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  // Isi form saat dialog dibuka (mode edit) atau kosongkan (mode baru).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setMessage(initial?.message ?? "");
    setMediaUrl(initial?.mediaUrl ?? null);
    setCtaText(initial?.ctaText ?? "");
    setCtaUrl(initial?.ctaUrl ?? "");
  }, [open, initial]);

  const pickFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Ukuran gambar maksimal 3 MB. Kompres dulu atau tempel URL gambar.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setMediaUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const insertToken = (token: string) => {
    const el = msgRef.current;
    if (!el) {
      setMessage((m) => m + token);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Judul kampanye wajib diisi.");
      return;
    }
    if (!message.trim()) {
      toast.error("Teks pesan wajib diisi.");
      return;
    }
    onSubmit({ name: name.trim(), message: message.trim(), mediaUrl, ctaText, ctaUrl });
  };

  const previewLines = message.split("\n");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-3 text-xl font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Megaphone className="size-5" />
            </span>
              {initial ? "Edit Kampanye" : "Rancang Kampanye"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 h-px bg-border" />

        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ---------- Form ---------- */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="k-judul">
                Judul Kampanye <span className="text-destructive">*</span>
              </Label>
              <Input
                id="k-judul"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Misal: Promo Diskon Spesial Lebaran"
                className="bg-muted/40"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Poster / Gambar Promosi</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {mediaUrl ? (
                <div className="relative overflow-hidden rounded-xl border">
                  <img src={mediaUrl} alt="Poster kampanye" className="max-h-56 w-full object-cover" />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-2"
                    onClick={() => setMediaUrl(null)}
                  >
                    Hapus
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-muted">
                    <Upload className="size-4" />
                  </span>
                  Klik untuk upload foto banner
                </button>
              )}
              <Input
                value={mediaUrl && mediaUrl.startsWith("data:") ? "" : (mediaUrl ?? "")}
                onChange={(e) => setMediaUrl(e.target.value || null)}
                placeholder="atau tempel URL gambar (https://…)"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="k-pesan">
                Teks Pesan (Caption) <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="k-pesan"
                ref={msgRef}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ketik detail promosi Anda di sini. Emoji sangat disarankan 🔥 🎁 …"
                className="bg-muted/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Klik tombol di kanan untuk sisip cepat:</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-primary/30 text-xs text-primary"
                    onClick={() => insertToken("{{name}}")}
                  >
                    <User className="mr-1 size-3" /> {"{{name}}"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-info/30 text-xs text-info"
                    onClick={() => insertToken("{{phone}}")}
                  >
                    <Phone className="mr-1 size-3" /> {"{{phone}}"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-info/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-info">
                <Link2 className="size-4" /> Tombol Interaktif (Native Flow / CTA URL)
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Teks Tombol
                  </Label>
                  <Input
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="Cth: DAFTAR SEKARANG"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    URL Tujuan
                  </Label>
                  <Input
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://contoh.com"
                    className="bg-background"
                  />
                </div>
              </div>
            </div>

            {extra}
          </div>

          {/* ---------- Live preview ---------- */}
          <div className="space-y-3">
            <div className="rounded-full border bg-muted/30 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-success align-middle" />
              Live Preview WhatsApp
            </div>
            <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border bg-background p-2 shadow-sm">
              <div className="overflow-hidden rounded-[1.6rem] border">
                <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2.5 text-white">
                  <span className="grid size-8 place-items-center rounded-full bg-white/20">
                    <User className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{senderName}</p>
                    <p className="text-[10px] opacity-80">online</p>
                  </div>
                  <Video className="size-4 opacity-80" />
                  <Phone className="size-4 opacity-80" />
                </div>
                <div className="min-h-[300px] space-y-2 bg-[#ECE5DD] p-3">
                  <p className="mx-auto w-fit rounded-md bg-white/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                    Hari ini
                  </p>
                  <div className="ml-auto w-[85%] overflow-hidden rounded-lg rounded-tr-none bg-[#DCF8C6] shadow-sm">
                    {mediaUrl ? (
                      <img src={mediaUrl} alt="" className="h-28 w-full object-cover" />
                    ) : null}
                    <div className="px-2.5 py-2">
                      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#1a1a1a]">
                        {message.trim()
                          ? previewLines.map((line, i) => <span key={i}>{line || "\u00A0"}<br /></span>)
                          : "Mulai ketik pesan untuk melihat preview…"}
                      </p>
                      {ctaText.trim() || ctaUrl.trim() ? (
                        <div className="mt-2 border-t border-black/10 pt-1.5 text-center text-[11px] font-semibold text-[#027EB5]">
                          <Link2 className="mr-1 inline size-3" />
                          {ctaText.trim() || "Buka Tautan"}
                        </div>
                      ) : null}
                      <p className="mt-1 text-right text-[9px] text-muted-foreground">✓✓</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#F0F0F0] p-2">
                  <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-[11px] text-muted-foreground">
                    Ketik pesan…
                  </div>
                  <span className="grid size-8 place-items-center rounded-full bg-[#075E54] text-white">
                    <Send className="size-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button size="lg" className="px-8" disabled={isPending} onClick={submit}>
            {isPending ? "Menyimpan…" : initial ? "Simpan Perubahan" : "Simpan & Luncurkan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
