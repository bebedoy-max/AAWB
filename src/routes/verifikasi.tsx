import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi Email — WBlast Suite Broadcast" },
      {
        name: "description",
        content: "Selesaikan verifikasi alamat email akun WBlast Anda dengan menempelkan tautan konfirmasi.",
      },
      { property: "og:title", content: "Verifikasi Email — WBlast Suite Broadcast" },
      {
        property: "og:description",
        content: "Selesaikan verifikasi alamat email akun WBlast Anda dengan menempelkan tautan konfirmasi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyPage,
});

type OtpType = "signup" | "email_change" | "recovery" | "invite" | "magiclink";

function parseLink(raw: string): { token: string; type: OtpType } | null {
  const value = raw.trim();
  if (!value) return null;
  let params: URLSearchParams;
  try {
    params = new URL(value).searchParams;
  } catch {
    const idx = value.indexOf("?");
    params = new URLSearchParams(idx >= 0 ? value.slice(idx + 1) : value);
  }
  const token = params.get("token_hash") ?? params.get("token");
  if (!token) return null;
  const type = (params.get("type") as OtpType | null) ?? "signup";
  return { token, type };
}

function VerifyPage() {
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const verify = async (token: string, type: OtpType) => {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type });
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("expired")) toast.error("Tautan verifikasi sudah kedaluwarsa. Minta email baru.");
      else if (msg.includes("invalid") || msg.includes("not found"))
        toast.error("Tautan verifikasi tidak valid atau sudah pernah dipakai.");
      else toast.error("Verifikasi gagal. Silakan coba lagi.");
      return;
    }
    setDone(true);
    toast.success("Email berhasil diverifikasi.");
    navigate({ to: "/dashboard" });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseLink(window.location.search);
    if (parsed) void verify(parsed.token, parsed.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const parsed = parseLink(link);
    if (!parsed) {
      toast.error("Tautan tidak dikenali. Salin seluruh alamat dari email konfirmasi.");
      return;
    }
    void verify(parsed.token, parsed.type);
  };

  return (
    <div className="flex min-h-screen items-center justify-center hero-gradient px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MessageCircle className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">WBlast</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verifikasi email</CardTitle>
            <CardDescription>
              Jika tautan di email Anda menampilkan halaman error, salin seluruh alamat tautan itu dan
              tempelkan di bawah ini untuk menyelesaikan verifikasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="verify-link">Tautan konfirmasi</Label>
              <Input
                id="verify-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="http://.../auth/v1/verify?token=...&type=signup"
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={loading || done}>
              {done ? "Terverifikasi" : "Verifikasi sekarang"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
