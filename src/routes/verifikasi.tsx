import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPostLoginPath } from "@/lib/post-login";

export const Route = createFileRoute("/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi Email — NAROWA Suite Broadcast" },
      {
        name: "description",
        content: "Menyelesaikan verifikasi alamat email akun NAROWA Anda secara otomatis.",
      },
      { property: "og:title", content: "Verifikasi Email — NAROWA Suite Broadcast" },
      {
        property: "og:description",
        content: "Menyelesaikan verifikasi alamat email akun NAROWA Anda secara otomatis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyPage,
});

type OtpType = "signup" | "email_change" | "recovery" | "invite" | "magiclink";

function friendlyError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes("expired")) return "Tautan verifikasi sudah kedaluwarsa. Minta email baru.";
  if (msg.includes("invalid") || msg.includes("not found"))
    return "Tautan verifikasi tidak valid atau sudah pernah dipakai.";
  return "Verifikasi gagal. Silakan coba lagi.";
}

function VerifyPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const finish = async () => {
      toast.success("Email berhasil diverifikasi.");
      navigate({ to: await getPostLoginPath(), replace: true });
    };

    const run = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      // Supabase may report a failure straight in the URL.
      const urlError = hash.get("error_description") ?? query.get("error_description");
      if (urlError) {
        // Tautan kadang dibuka dua kali; bila sesi sudah aktif, anggap berhasil.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          navigate({ to: await getPostLoginPath(), replace: true });
          return;
        }
        setError(friendlyError(urlError));
        return;
      }

      // 1) Implicit flow: the session arrives in the URL fragment.
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          // Klien mungkin sudah memproses tautan ini otomatis — cek sesi dulu.
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            window.history.replaceState(null, "", window.location.pathname);
            await finish();
            return;
          }
          setError(friendlyError(sessionError.message));
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        await finish();
        return;
      }

      // 2) PKCE flow: a one-time code to exchange for a session.
      const code = query.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            await finish();
            return;
          }
          setError(friendlyError(exchangeError.message));
          return;
        }
        await finish();
        return;
      }

      // 3) OTP link: token_hash / token in the query string.
      const token = query.get("token_hash") ?? query.get("token");
      if (token) {
        const type = (query.get("type") as OtpType | null) ?? "signup";
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: token, type });
        if (otpError) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            await finish();
            return;
          }
          setError(friendlyError(otpError.message));
          return;
        }
        await finish();
        return;
      }

      // Already signed in (link opened twice) — just continue.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: await getPostLoginPath(), replace: true });
        return;
      }

      setError("Tautan verifikasi tidak lengkap. Buka kembali tautan dari email Anda.");
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                <CircleAlert className="mx-auto size-8 text-destructive" />
                <div className="space-y-1">
                  <h1 className="text-base font-semibold">Verifikasi gagal</h1>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button asChild className="w-full">
                  <Link to="/auth">Kembali ke halaman masuk</Link>
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto size-8 animate-spin text-primary" />
                <div className="space-y-1">
                  <h1 className="text-base font-semibold">Memverifikasi email Anda…</h1>
                  <p className="text-sm text-muted-foreground">
                    Tunggu sebentar, Anda akan langsung diarahkan ke dashboard.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
