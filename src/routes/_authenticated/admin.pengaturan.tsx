/**
 * Pengaturan sistem dengan panel samping: gateway WhatsApp, bot Telegram,
 * reward & keuangan, log aktivitas, tampilan, dan koneksi Telegram.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Coins,
  MessageCircle,
  PlugZap,
  ScrollText,
  Send,
  Palette,
  UserRound,
  Image as ImageIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getGatewaySettings,
  getGlobalAppTheme,
  getSupportTelegram,
  getTelegramSettings,
  saveGatewaySettings,
  saveGlobalAppTheme,
  saveSupportTelegram,
  saveTelegramSettings,
  testGateway,
  testTelegramBot,
} from "@/lib/admin.functions";
import { getWaProfileSettings, saveWaProfileSettings } from "@/lib/wa-profile.functions";
import { AdminRewardSettings } from "@/components/admin-rewards";
import { AdminActivityLog } from "@/components/admin-activity-log";
import { useMyRole } from "./admin";
import { AdminPageTitle, Panel } from "@/components/admin-ui";
import { APP_THEMES, applyAppTheme, DEFAULT_APP_THEME, type AppThemeId } from "@/lib/app-theme";

export const Route = createFileRoute("/_authenticated/admin/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Sistem — AAWB" },
      { name: "description", content: "Kelola konfigurasi sistem dan tema warna global AAWB." },
      { property: "og:title", content: "Pengaturan Sistem — AAWB" },
      { property: "og:description", content: "Kelola konfigurasi sistem dan tema warna global AAWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PengaturanPage,
});

type SectionId =
  | "gateway"
  | "telegram-bot"
  | "reward"
  | "log"
  | "tampilan"
  | "telegram-akun"
  | "profil-wa";

const SECTIONS: {
  id: SectionId;
  label: string;
  hint: string;
  icon: LucideIcon;
  superOnly?: boolean;
}[] = [
  { id: "gateway", label: "WA Gateway", hint: "URL & API key", icon: PlugZap, superOnly: true },
  { id: "telegram-bot", label: "Bot Telegram", hint: "Token & username", icon: Send, superOnly: true },
  { id: "reward", label: "Reward & Keuangan", hint: "Nilai reward, referal", icon: Coins, superOnly: true },
  { id: "log", label: "User Log", hint: "Aktivitas pengguna", icon: ScrollText },
  { id: "tampilan", label: "Tampilan", hint: "Tema warna", icon: Palette },
  { id: "telegram-akun", label: "Telegram CS", hint: "Kontak bantuan pengguna", icon: MessageCircle },
  { id: "profil-wa", label: "Workers Profile", hint: "Nama & foto global", icon: ImageIcon },
];

function PengaturanPage() {
  const { data: me } = useMyRole();
  const isSuper = Boolean(me?.is_super_admin);
  const sections = SECTIONS.filter((s) => !s.superOnly || isSuper);
  const [active, setActive] = useState<SectionId>(isSuper ? "gateway" : "log");

  useEffect(() => {
    if (!sections.some((s) => s.id === active)) setActive(sections[0]?.id ?? "log");
  }, [active, sections]);

  return (
    <>
      <AdminPageTitle
        title="Pengaturan Sistem"
        description="Semua konfigurasi aplikasi dikelompokkan pada panel di samping."
      />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="rounded-xl border bg-card p-2">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map(({ id, label, hint, icon: Icon }) => (
              <li key={id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActive(id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    active === id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{label}</span>
                    <span className="hidden text-xs text-muted-foreground lg:block">{hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {active === "gateway" && isSuper ? <GatewayPanel /> : null}
          {active === "telegram-bot" && isSuper ? <TelegramBotPanel /> : null}
          {active === "reward" && isSuper ? <AdminRewardSettings /> : null}
          {active === "log" ? <AdminActivityLog /> : null}
          {active === "tampilan" ? <TampilanPanel /> : null}
          {active === "telegram-akun" ? <TelegramAkunPanel /> : null}
          {active === "profil-wa" ? <ProfilWhatsAppPanel /> : null}
        </div>
      </div>
    </>
  );
}

function TampilanPanel() {
  const queryClient = useQueryClient();
  const fetchTheme = useServerFn(getGlobalAppTheme);
  const persistTheme = useServerFn(saveGlobalAppTheme);
  const { data } = useQuery({
    queryKey: ["global-app-theme"],
    queryFn: () => fetchTheme(),
  });
  const selected = data?.theme ?? DEFAULT_APP_THEME;

  const save = useMutation({
    mutationFn: (theme: AppThemeId) => persistTheme({ data: { theme } }),
    onMutate: async (theme) => {
      await queryClient.cancelQueries({ queryKey: ["global-app-theme"] });
      const previous = queryClient.getQueryData<{ theme: AppThemeId }>(["global-app-theme"]);
      queryClient.setQueryData(["global-app-theme"], { theme });
      applyAppTheme(theme);
      return { previous };
    },
    onSuccess: (_result, theme) => toast.success(`Tema ${APP_THEMES.find((item) => item.id === theme)?.name ?? ""} diterapkan`),
    onError: (error: Error, _theme, context) => {
      const previous = context?.previous?.theme ?? DEFAULT_APP_THEME;
      queryClient.setQueryData(["global-app-theme"], { theme: previous });
      applyAppTheme(previous);
      toast.error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["global-app-theme"] }),
  });

  return (
    <Panel title="Tampilan" description="Pilih tema warna global untuk seluruh Admin dan Worker's.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Tema warna global">
        {APP_THEMES.map((theme) => (
          <label
            key={theme.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
              selected === theme.id ? "border-primary bg-primary/10" : "hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name="app-theme"
              value={theme.id}
              checked={selected === theme.id}
              onChange={() => save.mutate(theme.id)}
              disabled={save.isPending}
              className="size-4 accent-primary"
            />
            <span data-theme-swatch={theme.id} className="size-4 shrink-0 rounded-full border" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{theme.name}</span>
              <span className="block text-xs text-muted-foreground">{theme.category}</span>
            </span>
          </label>
        ))}
      </div>
    </Panel>
  );
}

function GatewayPanel() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getGatewaySettings);
  const persistSettings = useServerFn(saveGatewaySettings);
  const runTest = useServerFn(testGateway);

  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["gateway-settings"],
    queryFn: () => fetchSettings(),
  });

  useEffect(() => {
    if (settings) setUrl(settings.url);
  }, [settings]);

  const save = useMutation({
    mutationFn: (vars: { clearApiKey?: boolean }) =>
      persistSettings({ data: { url, apiKey, clearApiKey: vars.clearApiKey === true } }),
    onSuccess: () => {
      setApiKey("");
      toast.success("Pengaturan gateway tersimpan");
      queryClient.invalidateQueries({ queryKey: ["gateway-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => runTest(),
    onSuccess: (res) => (res.ok ? toast.success(res.message) : toast.error(res.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel
      title="Gateway WhatsApp"
      description="Alamat server wa-gateway dan kunci API untuk pemasangan QR serta pengiriman pesan."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gw-url">URL gateway</Label>
            <Input
              id="gw-url"
              placeholder="https://gateway.domainanda.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gw-key">API key</Label>
            <Input
              id="gw-key"
              type="password"
              placeholder={
                settings?.has_api_key
                  ? `Tersimpan: ${settings.api_key_masked} — isi untuk mengganti`
                  : "Masukkan kunci API gateway"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate({})} disabled={save.isPending}>
            Simpan
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            <PlugZap className="mr-2 size-4" />
            Uji koneksi
          </Button>
          {settings?.has_api_key ? (
            <Button
              variant="ghost"
              onClick={() => save.mutate({ clearApiKey: true })}
              disabled={save.isPending}
            >
              Hapus API key
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Kunci API disimpan di database dan tidak pernah ditampilkan kembali secara utuh.
        </p>
      </div>
    </Panel>
  );
}

function TelegramBotPanel() {
  const queryClient = useQueryClient();
  const fetchTg = useServerFn(getTelegramSettings);
  const persistTg = useServerFn(saveTelegramSettings);
  const runTgTest = useServerFn(testTelegramBot);

  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");

  const { data: tg } = useQuery({
    queryKey: ["telegram-settings"],
    queryFn: () => fetchTg(),
  });

  useEffect(() => {
    if (tg) setUsername(tg.username);
  }, [tg]);

  const saveTg = useMutation({
    mutationFn: (vars: { clearToken?: boolean }) =>
      persistTg({ data: { token, username, clearToken: vars.clearToken === true } }),
    onSuccess: () => {
      setToken("");
      toast.success("Pengaturan Telegram tersimpan");
      queryClient.invalidateQueries({ queryKey: ["telegram-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testTg = useMutation({
    mutationFn: () => runTgTest(),
    onSuccess: (res) => (res.ok ? toast.success(res.message) : toast.error(res.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel
      title="Bot Telegram"
      description="Token dan username bot untuk menghubungkan akun Telegram pengguna. Buat bot lewat @BotFather."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tg-username">Username bot</Label>
            <Input
              id="tg-username"
              placeholder="nama_bot_anda"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Token bot</Label>
            <Input
              id="tg-token"
              type="password"
              placeholder={
                tg?.has_token ? `Tersimpan: ${tg.token_masked} — isi untuk mengganti` : "123456789:AA..."
              }
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveTg.mutate({})} disabled={saveTg.isPending}>
            Simpan
          </Button>
          <Button variant="outline" onClick={() => testTg.mutate()} disabled={testTg.isPending}>
            <PlugZap className="mr-2 size-4" />
            Uji bot
          </Button>
          {tg?.has_token ? (
            <Button
              variant="ghost"
              onClick={() => saveTg.mutate({ clearToken: true })}
              disabled={saveTg.isPending}
            >
              Hapus token
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Token disimpan di database dan tidak pernah ditampilkan kembali secara utuh.
        </p>
      </div>
    </Panel>
  );
}

function TelegramAkunPanel() {
  const queryClient = useQueryClient();
  const fetchSupport = useServerFn(getSupportTelegram);
  const persistSupport = useServerFn(saveSupportTelegram);
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState(false);

  const { data: support, isLoading } = useQuery({
    queryKey: ["support-telegram"],
    queryFn: () => fetchSupport(),
  });

  useEffect(() => {
    if (!touched) setUsername(support?.username ?? "");
  }, [support, touched]);

  const save = useMutation({
    mutationFn: () => persistSupport({ data: { username } }),
    onSuccess: () => {
      toast.success("Kontak Telegram CS tersimpan");
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: ["support-telegram"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = username.replace(/^@/, "").trim();

  return (
    <Panel
      title="Telegram CS"
      description="Akun Telegram tim bantuan. Tombol “Hubungi via Telegram” pada dashboard Worker's akan membuka obrolan ini."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-telegram">Username Telegram CS</Label>
            <Input
              id="cs-telegram"
              placeholder="contoh: aawb_support"
              value={username}
              onChange={(e) => {
                setTouched(true);
                setUsername(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Tanpa tanda @. Kosongkan untuk menyembunyikan tombol kontak.
            </p>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="text-xs text-muted-foreground">Tautan yang dipakai pengguna</p>
            <p className="mt-1 font-medium">{preview ? `https://t.me/${preview}` : "Belum diatur"}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Simpan kontak
            </Button>
            {preview ? (
              <Button variant="outline" asChild>
                <a href={`https://t.me/${preview}`} target="_blank" rel="noopener noreferrer">
                  Uji buka obrolan
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}

function ProfilWhatsAppPanel() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getWaProfileSettings);
  const persistProfile = useServerFn(saveWaProfileSettings);

  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["wa-profile-settings"],
    queryFn: () => fetchProfile(),
  });

  useEffect(() => {
    if (profile && !touched) {
      setName(profile.name ?? "");
      setPhoto(profile.photo ?? null);
    }
  }, [profile, touched]);

  const pickPhoto = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Format foto harus JPEG, PNG, atau WEBP.");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("Ukuran foto maksimal 1,5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setTouched(true);
      setPhoto(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const save = useMutation({
    mutationFn: () =>
      persistProfile({
        data: {
          name,
          photo: photo && photo.startsWith("data:") ? photo : null,
          clearPhoto: photo === null,
        },
      }),
    onSuccess: () => {
      toast.success("Workers Profile tersimpan");
      setTouched(false);
      queryClient.invalidateQueries({ queryKey: ["wa-profile-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel
      title="Workers Profile"
      description="Nama dan foto profil yang wajib dipakai seluruh Worker's pada akun WhatsApp perangkat mereka."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted">
              {photo ? (
                <img src={photo} alt="Foto profil global" className="size-full object-cover" />
              ) : (
                <UserRound className="size-7 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <Input
                id="wa-profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickPhoto(file);
                }}
              />
              <p className="text-xs text-muted-foreground">JPEG, PNG, atau WEBP. Maksimal 1,5 MB.</p>
              {photo ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTouched(true);
                    setPhoto(null);
                  }}
                >
                  Hapus foto
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5 sm:max-w-md">
            <Label htmlFor="wa-profile-name">Nama profil</Label>
            <Input
              id="wa-profile-name"
              placeholder="contoh: Layanan Pelanggan AAWB"
              maxLength={25}
              value={name}
              onChange={(e) => {
                setTouched(true);
                setName(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">Maksimal 25 karakter, sesuai batas WhatsApp.</p>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Simpan profil
          </Button>
        </div>
      )}
    </Panel>
  );
}
