<<<<<<< HEAD
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Eye, EyeOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
=======
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { recordActivity } from "@/lib/activity-log.functions";
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/my-client";
import { recordActivity } from "@/lib/activity-log.functions";
import { getPostLoginPath } from "@/lib/post-login";
import {
  checkUsername,
  memberPassword,
  normalizeUsername,
  registerMember,
  usernameEmail,
} from "@/lib/member-auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk atau Daftar — AAWB" },
      { name: "description", content: "Masuk dengan username atau buat akun member AAWB." },
      { property: "og:title", content: "Masuk atau Daftar — AAWB" },
      { property: "og:description", content: "Masuk dengan username atau buat akun member AAWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function authErrorMessage(message: string): string {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials")) return "Username atau kata sandi salah.";
  if (value.includes("rate limit")) return "Terlalu banyak percobaan. Coba kembali beberapa saat lagi.";
  return "Terjadi kendala. Silakan coba lagi.";
}

function AuthPage() {
  const navigate = useNavigate();
  const checkName = useServerFn(checkUsername);
  const createMember = useServerFn(registerMember);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signupEmail, setSignupEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) navigate({ to: await getPostLoginPath() });
    });
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) setReferralCode(code.toUpperCase());
  }, [navigate]);

  const normalized = useMemo(() => normalizeUsername(username), [username]);
  const validUsername = /^[a-z0-9_]{4,24}$/.test(normalized);

  const signIn = async () => {
    if (!username.trim() || password.length < 4) {
      toast.error("Username dan kata sandi minimal 4 karakter.");
      return;
    }
    setLoading(true);
    const isLegacyEmail = username.includes("@");
    const { error } = await supabase.auth.signInWithPassword({
      email: isLegacyEmail ? username.trim() : usernameEmail(normalized),
      password: isLegacyEmail ? password : memberPassword(password),
    });
    if (error) {
      setLoading(false);
      toast.error(authErrorMessage(error.message));
      return;
    }
<<<<<<< HEAD
    await recordActivity({ data: { action: "login", detail: "Masuk dengan username" } }).catch(() => {});
    navigate({ to: await getPostLoginPath() });
=======
    await recordActivity({ data: { action: "login", detail: "Masuk dengan email" } }).catch(() => {});
    navigate({ to: "/dashboard" });
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
  };

  const nextStep = async () => {
    if (step === 1) {
      if (name.trim().length < 2) {
        toast.error("Masukkan nama Anda.");
        return;
      }
      setName(name.trim());
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!validUsername) {
        toast.error("Username minimal 4 karakter dan hanya boleh berisi huruf kecil, angka, atau garis bawah.");
        return;
      }
      if (password.length < 4) {
        toast.error("Kata sandi minimal 4 karakter.");
        return;
      }
      setLoading(true);
      try {
        const result = await checkName({ data: { username: normalized } });
        if (!result.available) {
          toast.error("Username sudah digunakan.");
          return;
        }
        setUsername(normalized);
        setStep(3);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Username belum dapat diperiksa.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (step === 3) {
      setStep(4);
    }
  };

  const finishRegistration = async () => {
    if (!privacyAccepted) {
      toast.error("Setujui Kebijakan Privasi untuk melanjutkan.");
      return;
    }
    setLoading(true);
    try {
      const result = await createMember({
        data: { username: normalized, password, name, referralCode: referralCode || undefined },
      });
      if (!result.ok) {
        toast.error(result.error);
        if (result.error.includes("Username")) setStep(2);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: result.email,
        password: memberPassword(password),
      });
      if (error) throw error;
      if (referralCode) localStorage.setItem("wblast_ref", referralCode);
      toast.success("Akun berhasil dibuat.");
      navigate({ to: "/dashboard" });
<<<<<<< HEAD
    } catch (error) {
      toast.error(error instanceof Error ? authErrorMessage(error.message) : "Akun belum dapat dibuat.");
    } finally {
      setLoading(false);
=======
      return;
    }
    setSignupEmail(email);
  };

  const googleSignIn = async () => {
    // Login/registrasi Google berjalan di Supabase milik sendiri, jadi provider
    // Google harus diaktifkan di sana. Kode referal (bila ada) dibawa lewat
    // penyimpanan lokal supaya tetap terpakai setelah kembali dari Google.
    const code = ref.trim().toUpperCase();
    if (code) localStorage.setItem("wblast_ref", code);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account", access_type: "online" },
      },
    });
    if (error) {
      setLoading(false);
      toast.error(
        "Login Google belum bisa dipakai. Pastikan provider Google sudah aktif di database Anda.",
      );
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
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
    <div className="member-surface flex min-h-screen items-center justify-center bg-secondary/50 px-4 py-8">
      <div className="relative mx-auto w-full max-w-md">
        <Link to="/" className="absolute bottom-[calc(100%+1.5rem)] left-1/2 flex -translate-x-1/2 justify-center"><BrandLogo className="h-20" /></Link>
        <div className="rounded-lg border bg-card p-6 shadow-panel sm:p-8">
          {mode === "login" ? (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-primary"><UserRound className="size-5" /></div>
                <h1 className="font-display text-2xl font-bold">Selamat datang kembali</h1>
                <p className="mt-1 text-sm text-muted-foreground">Masuk untuk melanjutkan perjalanan Anda.</p>
              </div>
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!loading) void signIn(); }}>
                <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username Anda" /></div>
                <div className="space-y-1.5"><Label htmlFor="password">Kata sandi</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pr-10" /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label="Tampilkan kata sandi">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div>
                <Button type="submit" className="w-full" disabled={loading}>Masuk <ArrowRight className="ml-1 size-4" /></Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">Belum punya akun? <button type="button" className="font-semibold text-primary" onClick={() => { setMode("register"); setStep(1); }}>Daftar sekarang</button></p>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="mb-4 flex gap-2">{[1, 2, 3, 4].map((item) => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
                <p className="text-xs font-semibold text-primary">LANGKAH {step} DARI 4</p>
                <h1 className="mt-1 font-display text-2xl font-bold">{step === 1 ? "Masukkan nama" : step === 2 ? "Buat akun" : step === 3 ? "Kode referral" : "Kebijakan Privasi"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Proses singkat, tanpa email dan tanpa verifikasi.</p>
              </div>
              <div className="min-h-36 space-y-4">
                {step === 1 && <div className="space-y-1.5"><Label htmlFor="register-name">Nama lengkap</Label><Input id="register-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama Anda" maxLength={80} /></div>}
                {step === 2 && <><div className="space-y-1.5"><Label htmlFor="register-username">Username</Label><Input id="register-username" autoFocus value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="minimal 4 karakter" maxLength={24} /><p className="text-xs text-muted-foreground">Gunakan huruf kecil, angka, atau garis bawah.</p></div><div className="space-y-1.5"><Label htmlFor="register-password">Kata sandi</Label><div className="relative"><Input id="register-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="minimal 4 karakter" maxLength={72} className="pr-10" /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label="Tampilkan kata sandi">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div></>}
                {step === 3 && <div className="space-y-1.5"><Label htmlFor="register-ref">Kode referral (opsional)</Label><Input id="register-ref" autoFocus value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="Masukkan kode referral" maxLength={12} /></div>}
                {step === 4 && <div className="flex items-start gap-3 rounded-lg border bg-secondary/50 p-4"><Checkbox id="privacy-policy" checked={privacyAccepted} onCheckedChange={(checked) => setPrivacyAccepted(checked === true)} /><Label htmlFor="privacy-policy" className="cursor-pointer text-sm leading-5">Saya menyetujui Kebijakan Privasi serta Syarat &amp; Ketentuan AAWB.</Label></div>}
              </div>
              <div className="mt-6 flex gap-2"><Button variant="outline" size="icon" onClick={() => step === 1 ? setMode("login") : setStep((current) => current - 1)} aria-label="Kembali"><ArrowLeft className="size-4" /></Button><Button className="flex-1" disabled={loading} onClick={() => step === 4 ? void finishRegistration() : void nextStep()}>{step === 4 ? "Selesai" : "Lanjut"}<ArrowRight className="ml-1 size-4" /></Button></div>
              <p className="mt-5 text-center text-sm text-muted-foreground">Sudah punya akun? <button type="button" className="font-semibold text-primary" onClick={() => setMode("login")}>Masuk</button></p>
            </>
          )}
        </div>
<<<<<<< HEAD
=======

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
                <Button type="submit" className="w-full" disabled={loading}>
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
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
      </div>
    </div>
  );
}