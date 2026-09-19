import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "../lib/theme";
import { Toaster } from "../components/ui/sonner";
import { CampaignAutoRunner } from "../components/campaign-auto-runner";
import { supabase } from "../integrations/supabase/my-client";
import { getGlobalAppTheme } from "../lib/admin.functions";
import { applyAppTheme, type AppThemeId } from "../lib/app-theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Halaman tidak ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Halaman tidak dapat dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kendala. Silakan muat ulang halaman atau kembali ke beranda.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Coba lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ke beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getGlobalAppTheme(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AAWB — Ruang Aktivitas Worker's" },
      {
        name: "description",
        content:
          "Kelola aktivitas dan pantau perkembangan akun Anda dengan mudah.",
      },
      { property: "og:title", content: "AAWB — Ruang Aktivitas Worker's" },
      {
        property: "og:description",
        content:
          "Kelola aktivitas dan pantau perkembangan akun Anda dengan mudah.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Urbanist:wght@500;600;700;800&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { theme } = Route.useLoaderData();

  return (
    <html lang="id" data-app-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { theme } = Route.useLoaderData();
  const router = useRouter();

  // Saat akun berganti (login/logout), buang data lama agar peran & isi halaman
  // tidak tertukar antar akun.
  useEffect(() => {
    let lastUserId: string | null | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const userId = session?.user?.id ?? null;
      if (event === "SIGNED_IN" && userId === lastUserId) return;
      lastUserId = userId;
      queryClient.clear();
      router.invalidate();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  // Sesi "always on": perbarui token secara berkala dan setiap kali pengguna
  // kembali ke tab, supaya halaman yang ditinggal lama tidak memaksa login ulang.
  // Logout hanya terjadi bila pengguna menekan tombol keluar sendiri.
  useEffect(() => {
    let active = true;
    const keepAlive = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active || !data.session) return;
        const expiresAtMs = (data.session.expires_at ?? 0) * 1000;
        // Perbarui bila token akan kedaluwarsa dalam 5 menit ke depan.
        if (expiresAtMs - Date.now() < 5 * 60 * 1000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // Jaringan putus sesaat tidak boleh mengeluarkan pengguna.
      }
    };
    void keepAlive();
    const interval = window.setInterval(keepAlive, 10 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void keepAlive();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GlobalAppTheme theme={theme} />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {/* Pekerja kampanye jalan di seluruh halaman, bukan hanya di halaman Kampanye. */}
        <CampaignAutoRunner />
        <Toaster position="top-right" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function GlobalAppTheme({ theme }: { theme: AppThemeId }) {
  useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  return null;
}
