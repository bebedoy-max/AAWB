import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Gauge,
  ArrowRight,
  Smartphone,
  ListChecks,
  Wallet,
  Gift,
  CalendarClock,
  MessageSquareText,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const TITLE = "AAWB — Broadcast WhatsApp, Reward, dan Referal dalam Satu Aplikasi";
const DESC =
  "Hubungkan perangkat WhatsApp lewat QR, impor kontak dari CSV, siapkan pesan siap kirim, jalankan kampanye terjadwal, lalu kumpulkan reward per pesan terkirim dan bonus referal berjenjang.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Smartphone,
    title: "Perangkat WhatsApp via QR",
    body: "Pasangkan beberapa nomor sekaligus, pantau status sesi, dan hubungkan ulang saat terputus.",
  },
  {
    icon: MessageSquareText,
    title: "Pesan siap kirim",
    body: "Susun isi pesan dengan variabel dinamis, simpan template favorit, dan pratinjau sebelum dikirim.",
  },
  {
    icon: CalendarClock,
    title: "Kampanye terjadwal",
    body: "Jadwalkan pengiriman, atur jeda acak antar pesan, batas per batch, dan percobaan ulang.",
  },
  {
    icon: ListChecks,
    title: "Antrean & log audit",
    body: "Pantau setiap pesan: terkirim, gagal, atau menunggu, lengkap dengan jejak aktivitas.",
  },
  {
    icon: Wallet,
    title: "Saldo & reward",
    body: "Setiap pesan yang sukses terkirim menambah saldo. Ajukan penarikan ke bank atau e-wallet.",
  },
  {
    icon: Gift,
    title: "Program referal berjenjang",
    body: "Bagikan kode undangan dan dapatkan bonus dari aktivitas tim Anda hingga tiga tingkat.",
  },
];

const STATS = [
  { value: "Multi", label: "perangkat per akun" },
  { value: "3", label: "tingkat bonus referal" },
  { value: "24/7", label: "antrean terpantau" },
];

const STEPS = [
  { n: "01", title: "Pasangkan nomor", body: "Scan QR sekali, perangkat siap dipakai mengirim." },
  { n: "02", title: "Siapkan penerima", body: "Impor CSV, rapikan nomor, kelompokkan jadi grup." },
  { n: "03", title: "Kirim & dapat reward", body: "Jalankan kampanye, saldo bertambah tiap pesan sukses." },
];

function Landing() {
  return (
    <div className="min-h-screen hero-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLogo className="h-24" />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/auth">Masuk</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/auth">Daftar gratis</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-14 pt-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <Gauge className="size-3.5 text-primary" /> Broadcast aman + penghasilan dari tiap pesan
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Broadcast WhatsApp yang rapi, aman, dan{" "}
          <span className="text-primary">menghasilkan</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          AAWB menyatukan pengelolaan perangkat, kontak, pesan siap kirim, dan kampanye terjadwal
          dengan program saldo reward serta referal berjenjang untuk tim Anda.
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

        <dl className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card/60 p-4 backdrop-blur">
              <dt className="text-xl font-bold text-primary">{s.value}</dt>
              <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Semua yang Anda butuhkan</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
          Dari pemasangan perangkat sampai pencairan saldo, semuanya ada di satu tempat.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card
              key={title}
              className="group border-border/70 shadow-none transition-colors hover:border-primary/50"
            >
              <CardContent className="flex gap-4 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Tiga langkah saja</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border bg-card/60 p-6 backdrop-blur">
              <span className="text-xs font-bold tracking-widest text-primary">{s.n}</span>
              <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border bg-card/70 p-8 text-center backdrop-blur">
          <h2 className="text-xl font-semibold tracking-tight">Siap mulai hari ini?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Buat akun, pasangkan nomor pertama Anda, dan kumpulkan reward dari setiap pesan yang
            berhasil terkirim.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/auth">
              Buat akun AAWB <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AAWB — Suite Broadcast WhatsApp
      </footer>
    </div>
  );
}
