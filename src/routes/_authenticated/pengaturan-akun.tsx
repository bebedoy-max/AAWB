import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { memberPassword } from "@/lib/member-auth.functions";
import {
  disconnectTelegram,
  getTelegramStatus,
  notifyOwnPasswordChanged,
  startTelegramLink,
} from "@/lib/telegram.functions";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowLeft, Eye, EyeOff, Landmark, Save, Send, UserRound, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pengaturan-akun")({
  head: () => ({
    meta: [
      { title: "Pengaturan Akun — NAROWA" },
      { name: "description", content: "Kelola identitas akun dan rekening tujuan pencairan saldo Anda." },
      { property: "og:title", content: "Pengaturan Akun — NAROWA" },
      { property: "og:description", content: "Kelola identitas akun dan rekening tujuan pencairan saldo Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountSettings,
});

const BANKS = [
  "BCA", "BNI", "BRI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Danamon", "BTN", "SeaBank", "Bank Jago", "Lainnya",
];

const EWALLETS = ["DANA", "OVO", "GoPay", "ShopeePay", "LinkAja", "iSaku", "Lainnya"];

type AccountProfile = {
  organization_name: string | null;
  telegram_username: string | null;
  disbursement_type: "bank" | "ewallet" | null;
  disbursement_destination: string | null;
  disbursement_account_number: string | null;
  disbursement_owner_name: string | null;
};

function useMyAccount() {
  return useQuery({
    queryKey: ["my-account-settings"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user!;
      const username =
        (user.user_metadata as { username?: string } | undefined)?.username ??
        user.email?.split("@")[0] ??
        "";
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "organization_name, telegram_username, disbursement_type, disbursement_destination, disbursement_account_number, disbursement_owner_name",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      // Jika kolom baru belum dimigrasikan, halaman tetap terbuka dengan isian kosong.
      const profile = error ? null : ((data ?? null) as AccountProfile | null);
      return { user, username, profile };
    },
  });
}

function AccountSettings() {
  const { data } = useMyAccount();
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Button variant="outline" size="sm" asChild className="mb-5">
        <Link to="/dashboard">
          <ArrowLeft className="mr-1 size-4" /> Kembali
        </Link>
      </Button>
      <PageHeader
        title="Pengaturan Akun"
        description="Kelola identitas akun Anda dan atur rekening tujuan pencairan saldo."
      />
      <div className="space-y-6">
        <AccountInfoCard
          key={`info-${data?.username ?? "loading"}`}
          username={data?.username ?? ""}
          profile={data?.profile ?? null}
        />
        <TelegramConnectCard />
        <DisbursementCard key={`disb-${data?.profile ? "ready" : "loading"}`} profile={data?.profile ?? null} />
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function AccountInfoCard({ username, profile }: { username: string; profile: AccountProfile | null }) {
  const queryClient = useQueryClient();
  const initialName = profile?.organization_name ?? "";
  const [fullName, setFullName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");

  useEffect(() => {
    setFullName(profile?.organization_name ?? "");
  }, [profile]);

  const nameChanged = fullName.trim() !== (profile?.organization_name ?? "").trim();
  const wantsPassword = password.length > 0 || passwordRepeat.length > 0;
  const hasChanges = nameChanged || wantsPassword;

  const save = useMutation({
    mutationFn: async () => {
      if (!hasChanges) throw new Error("Tidak ada perubahan untuk disimpan.");
      const name = fullName.trim();
      if (name.length < 2) throw new Error("Nama lengkap minimal 2 karakter.");

      if (wantsPassword) {
        if (password.length < 8) throw new Error("Kata sandi baru minimal 8 karakter.");
        if (password !== passwordRepeat) throw new Error("Ulangi kata sandi tidak cocok.");
      }

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user!;

      if (nameChanged) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          { user_id: user.id, organization_name: name } as never,
          { onConflict: "user_id" },
        );
        if (profileError) throw profileError;
      }

      const authUpdate: { password?: string; data?: Record<string, unknown> } = {};
      if (nameChanged) authUpdate.data = { organization_name: name };
      if (wantsPassword) authUpdate.password = memberPassword(password);
      const { error: authError } = await supabase.auth.updateUser(authUpdate);
      if (authError) throw new Error("Perubahan belum dapat disimpan. Silakan coba lagi.");

      // Notifikasi Telegram bersifat pelengkap: kegagalannya tidak membatalkan simpan.
      if (wantsPassword) await notifyOwnPasswordChanged().catch(() => undefined);

      return { nameChanged, passwordChanged: wantsPassword };
    },
    onSuccess: (res) => {
      toast.success(
        res.passwordChanged && res.nameChanged
          ? "Nama dan kata sandi berhasil diperbarui"
          : res.passwordChanged
            ? "Kata sandi berhasil diperbarui"
            : "Nama lengkap berhasil diperbarui",
      );
      setPassword("");
      setPasswordRepeat("");
      queryClient.invalidateQueries({ queryKey: ["my-account-settings"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl shadow-panel">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-secondary">
            <UserRound className="size-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Informasi Akun</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="full-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nama Lengkap
            </Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Username
            </Label>
            <Input id="username" value={username} disabled className="bg-secondary/60" />
            <p className="text-xs text-muted-foreground">Username tidak dapat diubah.</p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kata Sandi Baru
            </Label>
            <PasswordInput
              id="new-password"
              value={password}
              onChange={setPassword}
              placeholder="Kosongkan jika tidak diubah"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repeat-password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ulangi Kata Sandi
            </Label>
            <PasswordInput
              id="repeat-password"
              value={passwordRepeat}
              onChange={setPasswordRepeat}
              placeholder="Ketik ulang kata sandi baru"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {!hasChanges ? (
            <span className="text-xs text-muted-foreground">Belum ada perubahan.</span>
          ) : null}
          <Button onClick={() => save.mutate()} disabled={save.isPending || !hasChanges}>
            <Save className="mr-2 size-4" />
            {save.isPending ? "Menyimpan…" : "Simpan Akun"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TelegramConnectCard() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => getTelegramStatus(),
    refetchInterval: (query) =>
      (query.state.data as { connected?: boolean } | undefined)?.connected ? false : 5000,
  });

  const connect = useMutation({
    mutationFn: () => startTelegramLink(),
    onSuccess: (res) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
      toast.info("Tekan START pada obrolan bot Telegram yang terbuka untuk menyelesaikan koneksi.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectTelegram(),
    onSuccess: () => {
      toast.success("Akun Telegram diputuskan");
      queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl shadow-panel">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-secondary">
            <Send className="size-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-xl">Notifikasi Telegram</CardTitle>
            <CardDescription>
              Sambungkan akun Telegram Anda untuk menerima notifikasi reset kata sandi, status
              penarikan saldo, dan pengumuman lain dari bot resmi.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memeriksa status…</p>
        ) : !status?.configured ? (
          <p className="text-sm text-muted-foreground">
            Bot Telegram belum diaktifkan oleh admin. Coba lagi nanti.
          </p>
        ) : status.connected ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                Tersambung{status.username ? ` sebagai @${status.username}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {status.first_name ?? "Akun Telegram"} · ID {status.chat_id}
              </p>
            </div>
            <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              Putuskan
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tekan tombol di bawah, lalu tekan <strong>START</strong> pada obrolan bot yang terbuka.
              Status di halaman ini berubah otomatis setelah tersambung.
            </p>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              <Send className="mr-2 size-4" />
              {connect.isPending ? "Membuka Telegram…" : "Hubungkan Telegram"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DisbursementCard({ profile }: { profile: AccountProfile | null }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<"bank" | "ewallet">(profile?.disbursement_type ?? "ewallet");
  const [destination, setDestination] = useState(profile?.disbursement_destination ?? "");
  const [accountNumber, setAccountNumber] = useState(profile?.disbursement_account_number ?? "");
  const [ownerName, setOwnerName] = useState(profile?.disbursement_owner_name ?? "");

  useEffect(() => {
    setType(profile?.disbursement_type ?? "ewallet");
    setDestination(profile?.disbursement_destination ?? "");
    setAccountNumber(profile?.disbursement_account_number ?? "");
    setOwnerName(profile?.disbursement_owner_name ?? "");
  }, [profile]);

  // Berpindah jenis (bank/e-wallet) mengosongkan isian agar tidak tercampur antar platform.
  const switchType = (next: "bank" | "ewallet") => {
    if (next === type) return;
    setType(next);
    setDestination("");
    setAccountNumber("");
    setOwnerName("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!destination) throw new Error(type === "bank" ? "Pilih bank tujuan." : "Pilih e-wallet tujuan.");
      const number = accountNumber.trim();
      if (!/^[0-9]{6,20}$/.test(number)) throw new Error("Nomor rekening/HP harus 6–20 digit angka.");
      const owner = ownerName.trim();
      if (owner.length < 2) throw new Error("Nama pemilik minimal 2 karakter.");

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: auth.user!.id,
          disbursement_type: type,
          disbursement_destination: destination,
          disbursement_account_number: number,
          disbursement_owner_name: owner,
        } as never,
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rekening pencairan berhasil disimpan");
      queryClient.invalidateQueries({ queryKey: ["my-account-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = type === "bank" ? BANKS : EWALLETS;

  return (
    <Card className="rounded-2xl shadow-panel">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-secondary">
            <Wallet className="size-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-xl">Metode Pencairan Saldo</CardTitle>
            <CardDescription>Rekening tujuan untuk penarikan saldo Anda.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Jenis Pencairan
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => switchType("bank")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                type === "bank" ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Landmark className="size-4" /> Rekening Bank
            </button>
            <button
              type="button"
              onClick={() => switchType("ewallet")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                type === "ewallet" ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Wallet className="size-4" /> e-Wallet
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Isian akan dikosongkan setiap kali berpindah jenis untuk mencegah kesalahan input antar platform.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {type === "bank" ? "Pilih Bank Tujuan" : "Pilih e-Wallet Tujuan"}
            </Label>
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger>
                <SelectValue placeholder={type === "bank" ? "Pilih Bank" : "Pilih e-Wallet"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-number" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {type === "bank" ? "Nomor Rekening" : "Nomor Akun / HP"}
            </Label>
            <Input
              id="account-number"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Contoh: 1234567890"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="owner-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nama Pemilik Rekening / e-Wallet
          </Label>
          <Input
            id="owner-name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Nama lengkap sesuai yang terdaftar di bank/aplikasi"
          />
          <p className="text-xs font-medium text-destructive">
            Penting: Penarikan dana dapat ditolak jika nama tidak sesuai.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-2 size-4" />
            {save.isPending ? "Menyimpan…" : "Simpan Rekening Pencairan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
