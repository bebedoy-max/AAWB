/** Halaman tautan ganti kata sandi: membuka pop-up ganti sandi lalu masuk dashboard. */
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/my-client";
import { getPostLoginPath } from "@/lib/post-login";

export const Route = createFileRoute("/ganti-sandi")({
  head: () => ({
    meta: [
      { title: "Ganti Kata Sandi — AAWB Suite Broadcast" },
      {
        name: "description",
        content: "Buat kata sandi baru untuk akun admin AAWB Suite Broadcast Anda.",
      },
      { property: "og:title", content: "Ganti Kata Sandi — AAWB Suite Broadcast" },
      {
        property: "og:description",
        content: "Buat kata sandi baru untuk akun admin AAWB Suite Broadcast Anda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GantiSandiPage,
});

function GantiSandiPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const urlError = hash.get("error_description") ?? query.get("error_description");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = query.get("code");
      const token = query.get("token_hash") ?? query.get("token");

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
      } else if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      } else if (token) {
        await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
        return;
      }
      setError(
        urlError
          ? "Tautan sudah kedaluwarsa atau pernah dipakai. Minta tautan baru dari menu Tim."
          : "Tautan tidak lengkap. Buka kembali tautan dari email Anda.",
      );
    };

    void run();
  }, []);

  const simpan = async () => {
    if (pass.length < 6) {
      toast.error("Kata sandi minimal 6 karakter.");
      return;
    }
    if (pass !== pass2) {
      toast.error("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: pass });
    setSaving(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    toast.success("Kata sandi berhasil diganti.");
    navigate({ to: await getPostLoginPath(), replace: true });
  };

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
                  <h1 className="text-base font-semibold">Tautan tidak berlaku</h1>
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
                  <h1 className="text-base font-semibold">Menyiapkan ganti kata sandi…</h1>
                  <p className="text-sm text-muted-foreground">
                    Isi kata sandi baru Anda pada jendela yang muncul.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={ready}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat kata sandi baru</DialogTitle>
            <DialogDescription>
              Minimal 6 karakter. Setelah disimpan, Anda langsung masuk ke dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kata sandi baru</Label>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ulangi kata sandi</Label>
              <Input
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void simpan();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={saving} onClick={() => void simpan()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan & masuk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
