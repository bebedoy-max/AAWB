import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, AlertTriangle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/my-client";
<<<<<<< HEAD
import { getPostLoginPath, type PostLoginPath } from "@/lib/post-login";
=======
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Menyelesaikan login — AAWB Suite Broadcast" },
      {
        name: "description",
        content: "Halaman singkat yang menyelesaikan proses masuk dengan akun Google ke AAWB.",
      },
      { property: "og:title", content: "Menyelesaikan login — AAWB Suite Broadcast" },
      {
        property: "og:description",
        content: "Halaman singkat yang menyelesaikan proses masuk dengan akun Google ke AAWB.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthCallback,
});

/** Tujuan setelah login, hanya menerima jalur di dalam aplikasi ini. */
<<<<<<< HEAD
function safeNext(value: string | null): PostLoginPath | null {
  if (value === "/admin" || value === "/dashboard") return value;
  return null;
=======
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
}

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const next = safeNext(url.searchParams.get("next"));

      const providerError =
        url.searchParams.get("error_description") ??
        url.searchParams.get("error") ??
        hash.get("error_description") ??
        hash.get("error");
      if (providerError) {
        setError(providerError);
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      }

      // Alur implicit (token di belakang #) diselesaikan sendiri oleh klien;
      // tunggu sesi muncul sebentar sebelum menyerah.
      for (let i = 0; i < 20; i += 1) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          window.history.replaceState({}, "", url.pathname);
<<<<<<< HEAD
          navigate({ to: next ?? (await getPostLoginPath()), replace: true });
=======
          navigate({ to: next, replace: true });
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      setError("Sesi login tidak terbaca. Silakan coba masuk kembali.");
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center hero-gradient px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo className="h-32" />
        </div>
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            {error ? (
              <>
                <AlertTriangle className="mx-auto size-10 text-destructive" />
                <div className="space-y-1">
                  <h1 className="text-base font-semibold">Login Google belum berhasil</h1>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button className="w-full" onClick={() => navigate({ to: "/auth", replace: true })}>
                  Coba lagi
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto size-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Sedang menyelesaikan proses masuk…</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
