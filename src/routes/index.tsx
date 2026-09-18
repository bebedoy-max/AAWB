import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

const TITLE = "AAWB — Ruang Aktivitas Member";
const DESC = "Kelola aktivitas dan pantau perkembangan akun Anda dengan mudah.";

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

function Landing() {
  return (
    <div className="member-surface min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-end px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2 text-xs font-semibold text-primary"><Globe2 className="size-4" /> ID</span>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-160px)] max-w-5xl flex-col items-center justify-center px-6 pb-20 pt-10 text-center">
        <BrandLogo className="h-20" />
        <h1 className="mt-7 max-w-3xl font-display text-4xl font-bold sm:text-6xl">
          Kelola aktivitas dengan mudah dan pantau seluruh perkembangan Anda.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          Semua kebutuhan member Anda tersedia dalam satu ruang yang sederhana.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Masuk ke Dashboard <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Kebijakan Privasi · Syarat &amp; Ketentuan · © {new Date().getFullYear()} AAWB
      </footer>
    </div>
  );
}
