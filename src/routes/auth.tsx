import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — WBlast Suite Broadcast" },
      {
        name: "description",
        content: "Masuk atau buat akun WBlast untuk mengelola kampanye broadcast WhatsApp.",
      },
      { property: "og:title", content: "Masuk — WBlast Suite Broadcast" },
      {
        property: "og:description",
        content: "Masuk atau buat akun WBlast untuk mengelola kampanye broadcast WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function authErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email atau kata sandi salah.";
  if (normalized.includes("email not confirmed")) return "Email belum dikonfirmasi. Periksa kotak masuk Anda.";
  if (normalized.includes("user already registered")) return "Email ini sudah terdaftar.";
  if (normalized.includes("password should be")) return "Kata sandi belum memenuhi ketentuan keamanan.";
  if (normalized.includes("rate limit")) return "Terlalu banyak percobaan. Silakan tunggu beberapa saat.";
  if (normalized.includes("confirmation email") || normalized.includes("sending"))
    return "Server email belum dikonfigurasi, sehingga email konfirmasi gagal dikirim. Matikan konfirmasi email atau atur SMTP di server Anda.";
  return "Terjadi kendala. Silakan coba lagi.";

}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error.message));
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const signUp = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/verifikasi`,
        data: { organization_name: org || "Organisasi Saya" },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error.message));
      return;
    }
    if (data.session) {
      navigate({ to: "/dashboard" });
      return;
    }
    toast.success(
      "Periksa kotak masuk untuk mengonfirmasi email. Jika tautannya error, salin tautan itu dan tempelkan di halaman Verifikasi.",
    );
    navigate({ to: "/verifikasi" });
  };

  const googleSignIn = async () => {
    // Google login runs against our own Supabase project, so the Google provider
    // must be enabled there.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error("Login Google belum aktif di database Anda. Aktifkan provider Google terlebih dahulu.");
    }
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
            <CardTitle>Selamat datang kembali</CardTitle>
            <CardDescription>Kelola ruang kerja broadcast WhatsApp Anda.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Masuk</TabsTrigger>
                <TabsTrigger value="signup">Buat akun</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Kata sandi</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={signIn} disabled={loading}>
                  Masuk
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org">Organisasi</Label>
                  <Input
                    id="org"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="Nama organisasi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-up">Email</Label>
                  <Input
                    id="email-up"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-up">Kata sandi</Label>
                  <Input
                    id="password-up"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={signUp} disabled={loading}>
                  Buat akun
                </Button>
              </TabsContent>
            </Tabs>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> atau <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={googleSignIn}>
              Lanjutkan dengan Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
