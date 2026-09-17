import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
<<<<<<< HEAD
import { MailCheck } from "lucide-react";
=======
>>>>>>> 436f1994ae5416aeeff999e03397c6070c713daf
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
      { title: "Masuk — AAWB Suite Broadcast" },
      {
        name: "description",
        content: "Masuk atau buat akun AAWB untuk mengelola kampanye broadcast WhatsApp.",
      },
      { property: "og:title", content: "Masuk — AAWB Suite Broadcast" },
      {
        property: "og:description",
        content: "Masuk atau buat akun AAWB untuk mengelola kampanye broadcast WhatsApp.",
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
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupEmail, setSignupEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  // Kode referal dari tautan undangan (?ref=KODE) diisi otomatis.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) {
      setRef(code.toUpperCase());
      localStorage.setItem("wblast_ref", code.toUpperCase());
    }
  }, []);


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
    const code = ref.trim().toUpperCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/verifikasi`,
        data: { organization_name: org || "Pengguna", referral_code: code || null },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error.message));
      return;
    }
    if (code) localStorage.setItem("wblast_ref", code);
    if (data.session) {
      navigate({ to: "/dashboard" });
      return;
    }
<<<<<<< HEAD
    setSignupEmail(email);
=======
    toast.success(
      "Periksa kotak masuk untuk mengonfirmasi email. Jika tautannya error, salin tautan itu dan tempelkan di halaman Verifikasi.",
    );
    navigate({ to: "/verifikasi" });
>>>>>>> 436f1994ae5416aeeff999e03397c6070c713daf
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

  if (signupEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center hero-gradient px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <BrandLogo className="h-32" />
          </div>
          <Card>
            <CardContent className="space-y-4 p-8 text-center">
              <MailCheck className="mx-auto size-10 text-primary" />
              <div className="space-y-1">
                <h1 className="text-base font-semibold">Periksa email Anda</h1>
                <p className="text-sm text-muted-foreground">
                  Kami telah mengirim tautan verifikasi ke{" "}
                  <span className="font-medium text-foreground">{signupEmail}</span>. Silakan cek
                  kotak masuk atau folder spam, lalu klik tautan di dalamnya untuk memverifikasi
                  email Anda.
                </p>
              </div>
              <Button className="w-full" onClick={() => navigate({ to: "/" })}>
                OK
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center hero-gradient px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo className="h-32" />
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
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!loading) signIn();
                  }}
                  className="space-y-3"
                >
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
                <Button type="submit" className="w-full" disabled={loading}>
                  Masuk
                </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!loading) signUp();
                  }}
                  className="space-y-3"
                >
                <div className="space-y-1.5">
                  <Label htmlFor="org">Nama</Label>
                  <Input
                    id="org"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="Nama lengkap Anda"
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
                <div className="space-y-1.5">
                  <Label htmlFor="ref-up">Kode undangan (opsional)</Label>
                  <Input
                    id="ref-up"
                    value={ref}
                    onChange={(e) => setRef(e.target.value.toUpperCase())}
                    placeholder="Misal: BH3GEB"
                  />
                </div>
<<<<<<< HEAD
                <Button type="submit" className="w-full" disabled={loading}>
=======
                <Button className="w-full" onClick={signUp} disabled={loading}>
>>>>>>> 436f1994ae5416aeeff999e03397c6070c713daf
                  Buat akun
                </Button>
                </form>
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
