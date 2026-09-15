import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MessageCircle,
  ShieldCheck,
  Gauge,
  Users,
  Sparkles,
  ArrowRight,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WBlast — Platform Broadcast dan Otomatisasi WhatsApp" },
      {
        name: "description",
        content:
          "Hubungkan perangkat WhatsApp, impor kontak, buat templat spintax, dan jalankan kampanye broadcast dengan log pengiriman lengkap.",
      },
      { property: "og:title", content: "WBlast — Platform Broadcast dan Otomatisasi WhatsApp" },
      {
        property: "og:description",
        content:
          "Hubungkan perangkat WhatsApp, impor kontak, buat templat spintax, dan jalankan kampanye broadcast dengan log pengiriman lengkap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Smartphone,
    title: "Gateway multi-perangkat",
    body: "Pasangkan nomor lewat QR, pantau baterai dan aktivitas terakhir, lalu hubungkan ulang dengan mudah.",
  },
  {
    icon: Users,
    title: "Pengelola penerima",
    body: "Impor CSV dengan pemetaan kolom dan perubahan otomatis format nomor 08 → 628.",
  },
  {
    icon: Sparkles,
    title: "Template spintax",
    body: "Pratinjau langsung, variabel dinamis, dan penghitungan variasi pesan.",
  },
  {
    icon: ShieldCheck,
    title: "Kontrol keamanan akun",
    body: "Jeda acak, batas per batch, penjadwalan, dan percobaan ulang otomatis.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen hero-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MessageCircle className="size-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">WBlast</span>
        </div>
        <Button asChild variant="ghost">
          <Link to="/auth">Masuk</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-14 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Gauge className="size-3.5 text-primary" /> Dibuat untuk pengiriman massal yang aman
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Broadcast &amp; otomatisasi WhatsApp yang lebih aman
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          Hubungkan perangkat, kelola penerima, dan jalankan kampanye broadcast terjadwal dengan
          jeda acak serta antrean pengiriman yang dapat dipantau.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Mulai broadcast <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Buka dasbor</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="border-border/70 shadow-none">
            <CardContent className="flex gap-4 p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
