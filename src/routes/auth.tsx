import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Eye, EyeOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      { name: "description", content: "Masuk dengan username atau buat akun Worker's AAWB." },
      { property: "og:title", content: "Masuk atau Daftar — AAWB" },
      { property: "og:description", content: "Masuk dengan username atau buat akun Worker's AAWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function authErrorMessage(message: string): string {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials")) return "Username/email atau kata sandi salah.";
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
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) navigate({ to: await getPostLoginPath() });
    });
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) setReferralCode(code.toUpperCase());
  }, [navigate]);

  const normalized = useMemo(() => normalizeUsername(username), [username]);
  const validUsername = /^[a-z0-9_]{4,24}$/.test(normalized);

  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("rate")
          ? "Terlalu sering meminta kode. Tunggu sebentar lalu coba lagi."
          : "Kode OTP gagal dikirim. Periksa pengaturan pengiriman email.",
      );
      return false;
    }
    toast.success("Kode OTP dikirim ke email terdaftar. Berlaku beberapa menit.");
    return true;
  };

  const signIn = async () => {
    const identifier = username.trim();
    if (!identifier || password.length < 4) {
      toast.error("Username/email dan kata sandi minimal 4 karakter.");
      return;
    }
    setLoading(true);
    const isEmail = identifier.includes("@");
    const { error } = await supabase.auth.signInWithPassword({
      email: isEmail ? identifier : usernameEmail(normalized),
      password: isEmail ? password : memberPassword(password),
    });
    if (error) {
      setLoading(false);
      toast.error(authErrorMessage(error.message));
      return;
    }
    const target = await getPostLoginPath();
    if (target === "/admin") {
      // Admin dan super admin wajib email + verifikasi OTP.
      await supabase.auth.signOut();
      if (!isEmail) {
        setLoading(false);
        toast.error("Admin dan super admin wajib masuk memakai email terdaftar dan kata sandi.");
        return;
      }
      const sent = await sendOtp(identifier.toLowerCase());
      setLoading(false);
      if (sent) {
        setOtpEmail(identifier.toLowerCase());
        setOtpCode("");
      }
      return;
    }
    await recordActivity({
      data: { action: "login", detail: isEmail ? "Masuk dengan email" : "Masuk dengan username" },
    }).catch(() => {});
    navigate({ to: target });
  };

  const verifyOtp = async () => {
    if (!otpEmail || otpCode.length < 6) {
      toast.error("Masukkan 6 digit kode OTP.");
      return;
    }
    setOtpLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email: otpEmail, token: otpCode, type: "email" });
    if (error) {
      setOtpLoading(false);
      toast.error(
        error.message.toLowerCase().includes("expired")
          ? "Kode OTP kedaluwarsa. Minta kode baru."
          : "Kode OTP salah.",
      );
      return;
    }
    await recordActivity({ data: { action: "login", detail: "Masuk admin dengan OTP email" } }).catch(() => {});
    const target = await getPostLoginPath();
    setOtpLoading(false);
    setOtpEmail(null);
    navigate({ to: target });
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
    } catch (error) {
      toast.error(error instanceof Error ? authErrorMessage(error.message) : "Akun belum dapat dibuat.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="member-surface flex min-h-screen items-center justify-center bg-secondary/50 px-4 py-8">
      <div className="relative mx-auto w-full max-w-md">
        <Link to="/" className="absolute bottom-[calc(100%+0.25rem)] left-1/2 flex -translate-x-1/2 justify-center"><BrandLogo className="h-40" /></Link>
        <div className="rounded-lg border bg-card p-6 shadow-panel sm:p-8">
          {mode === "login" ? (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-primary"><UserRound className="size-5" /></div>
                <h1 className="font-display text-2xl font-bold">Selamat datang kembali</h1>
                <p className="mt-1 text-sm text-muted-foreground">Masuk untuk melanjutkan perjalanan Anda.</p>
              </div>
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!loading) void signIn(); }}>
                <div className="space-y-1.5"><Label htmlFor="username">Username atau email</Label><Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username (worker) atau email (admin)" /></div>
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
      </div>

      <Dialog open={otpEmail !== null} onOpenChange={(open) => { if (!open) { setOtpEmail(null); setOtpCode(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Verifikasi OTP</DialogTitle>
            <DialogDescription>
              Kode 6 digit telah dikirim ke {otpEmail}. Masukkan kode tersebut untuk membuka dashboard admin.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); if (!otpLoading) void verifyOtp(); }}
          >
            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="text-center text-lg tracking-[0.5em]"
            />
            <Button type="submit" className="w-full" disabled={otpLoading || otpCode.length < 6}>Verifikasi</Button>
          </form>
          <button
            type="button"
            className="text-center text-sm font-semibold text-primary disabled:opacity-60"
            disabled={otpLoading}
            onClick={() => { if (otpEmail) void sendOtp(otpEmail); }}
          >
            Kirim ulang kode
          </button>
        </DialogContent>
      </Dialog>
    </div>

  );
}