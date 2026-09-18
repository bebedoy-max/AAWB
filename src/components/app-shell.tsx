import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import {
  LayoutDashboard,
  Smartphone,
  Users,
  Send,
  Settings,
  Menu,
  Moon,
  Sun,
  LogOut,
  ShieldCheck,
  Wallet,
<<<<<<< HEAD
  HandCoins,
  Network,
  Home,
  CalendarDays,
  ListChecks,
  FileText,
  Clock3,
=======
  Gift,
  Rocket,
  Activity,
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
} from "lucide-react";

import { getMyRole } from "@/lib/admin.functions";
import { attachReferral } from "@/lib/rewards.functions";

import { supabase } from "@/integrations/supabase/my-client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

<<<<<<< HEAD
/** Menu member utama mengikuti alur ringkas pada referensi. */
const MEMBER_NAV = [
  { to: "/dashboard", label: "Beranda", icon: Home },
  { to: "/devices", label: "WhatsApp", icon: Smartphone },
  { to: "/rewards", label: "Klaim Saldo", icon: HandCoins },
  { to: "/referral", label: "Tim Afiliasi", icon: Network },
=======
/** Menu member/worker: hubungkan perangkat, blast, saldo. */
const MEMBER_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/devices", label: "Perangkat", icon: Smartphone },
  { to: "/blast", label: "Mulai Blast", icon: Rocket },
  { to: "/queue", label: "Log Pesan", icon: ListChecks },
  { to: "/rewards", label: "Saldo & Reward", icon: Wallet },
  { to: "/referral", label: "Referal", icon: Gift },
  { to: "/settings", label: "Pengaturan", icon: Settings },
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
] as const;

/** Menu utama admin (bar horizontal, mengikuti rancangan konsol admin). */
const ADMIN_NAV = [
  { to: "/admin", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/admin/pengguna", label: "Pengguna", icon: Users },
  { to: "/admin/kampanye", label: "Kampanye", icon: Send },
  { to: "/admin/nomor", label: "Data Nomor", icon: ListChecks },
  { to: "/admin/laporan", label: "Laporan", icon: FileText },
  { to: "/admin/klaim", label: "Klaim Dana", icon: Wallet },
  { to: "/admin/tim", label: "Tim Admin", icon: ShieldCheck },
  { to: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
] as const;

<<<<<<< HEAD
=======
/** Halaman pendukung admin yang tidak masuk bar utama. */
const ADMIN_EXTRA_NAV = [
  { to: "/monitor", label: "Monitoring Realtime", icon: Activity },
  { to: "/projects", label: "Proyek Blast", icon: Rocket },
  { to: "/contacts", label: "Kontak & Grup", icon: Users },
  { to: "/templates", label: "Template Pesan", icon: FileText },
  { to: "/campaigns", label: "Kampanye Pribadi", icon: Send },
  { to: "/queue", label: "Antrean & Log", icon: ListChecks },
  { to: "/devices", label: "Perangkat Saya", icon: Smartphone },
  { to: "/settings", label: "Pengaturan Akun", icon: Settings },
] as const;

const ALL_NAV = [...MEMBER_NAV, ...ADMIN_NAV, ...ADMIN_EXTRA_NAV];

>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
export function useIsAdmin(): boolean {
  const fetchRole = useServerFn(getMyRole);
  const { data } = useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token) {
        return { role: "member", is_admin: false, is_super_admin: false, setup_required: false };
      }
      return fetchRole();
    },
    retry: false,
    staleTime: 60_000,
  });
  return Boolean(data?.is_admin);
}

function isActivePath(pathname: string, to: string): boolean {
  if (to === "/admin") return pathname === "/admin" || pathname === "/admin/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

<<<<<<< HEAD
function NavLinks({ onNavigate, adminMode = false }: { onNavigate?: () => void; adminMode?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const items = adminMode || isAdmin ? [...ADMIN_NAV] : [...MEMBER_NAV];
=======
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const items = isAdmin ? [...ADMIN_NAV, ...ADMIN_EXTRA_NAV] : [...MEMBER_NAV];
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149

  return (
    <nav className="flex flex-col gap-1 px-3 pb-6">
      {items.map(({ to, label, icon: Icon }) => {
        const active = isActivePath(pathname, to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bar navigasi horizontal khusus konsol admin. */
function AdminTopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="border-b bg-card">
<<<<<<< HEAD
      <div className="mx-auto flex max-w-[1400px] items-center justify-center gap-2 overflow-x-auto px-3 py-2 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
=======
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 overflow-x-auto px-3 py-2 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
        {ADMIN_NAV.map(({ to, label, icon: Icon }) => {
          const active = isActivePath(pathname, to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
<<<<<<< HEAD
=======
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
              Lainnya
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ADMIN_EXTRA_NAV.map(({ to, label, icon: Icon }) => (
              <DropdownMenuItem key={to} asChild>
                <Link to={to}>
                  <Icon className="mr-2 size-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149
      </div>
    </div>
  );
}


function Brand() {
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center border-b px-4 py-5">
      <BrandLogo className="h-9 w-10 object-cover object-left" />
      <div className="min-w-0 border-l pl-4">
        <p className="text-sm font-bold leading-tight">Member</p>
        <p className="text-base font-semibold leading-tight text-primary">Dashboard</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState({ username: "member", name: "Member" });
  const [clock, setClock] = useState(new Date());
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const linkReferral = useServerFn(attachReferral);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const metadata = data.user?.user_metadata as { username?: string; organization_name?: string } | undefined;
      setAccount({
        username: metadata?.username ?? data.user?.email?.split("@")[0] ?? "member",
        name: metadata?.organization_name ?? "Member",
      });
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Kaitkan kode undangan setelah akun aktif (termasuk yang harus konfirmasi
  // email dulu). Kode diambil dari tautan ?ref= yang disimpan saat mendaftar
  // atau dari data pendaftaran akun. Dijalankan sekali per akun.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || cancelled) return;
      const stored = localStorage.getItem("wblast_ref");
      const meta = (user.user_metadata as { referral_code?: string } | undefined)?.referral_code;
      const code = (stored || meta || "").trim().toUpperCase();
      if (!code) return;
      const doneKey = `wblast_ref_done_${user.id}`;
      if (localStorage.getItem(doneKey)) return;
      try {
        await linkReferral({ data: { code } });
      } catch {
        // Kode tidak berlaku atau sudah terpakai — cukup abaikan.
      }
      localStorage.setItem(doneKey, "1");
      localStorage.removeItem("wblast_ref");
    })();
    return () => {
      cancelled = true;
    };
  }, [linkReferral]);

  const { data: activeSession } = useQuery({
    queryKey: ["active-session-badge"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("wa_sessions")
        .select("session_name,phone_number,status")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

<<<<<<< HEAD
  // Konsol admin memakai tata letak bar atas horizontal (seperti referensi),
  // sedangkan area member tetap memakai sidebar.
  const adminLayout = pathname === "/admin" || pathname.startsWith("/admin/");
=======
  const current = ALL_NAV.find((n) => n.to === pathname);
>>>>>>> d36e63154102d43dc2da41d8ccc12822fdaed149

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className={cn("flex min-h-screen w-full max-w-full overflow-x-hidden bg-background", !adminLayout && "member-surface")}>
      {adminLayout ? null : (
        <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <Brand />
            <p className="px-6 pb-2 pt-2 text-[10px] font-bold uppercase text-muted-foreground">Menu utama</p>
            <NavLinks />
            <div className="mt-auto border-t p-5">
              <p className="truncate text-sm font-bold">{account.name}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">@{account.username}</p>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">

        <header className={cn("sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-background/85 px-4 backdrop-blur lg:px-6", adminLayout ? "h-[4.75rem] border-b py-1" : "h-20")}>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigasi</SheetTitle>
              <Brand />
              <NavLinks adminMode={adminLayout} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          {adminLayout ? (
            <Link to="/admin" className="flex min-w-0 items-center gap-2">
              <BrandLogo className="h-[4.5rem] max-w-[300px] shrink-0" />
              <span className="hidden truncate text-sm font-semibold sm:inline">Admin</span>
            </Link>
          ) : (
            <div className="mx-auto grid min-w-0 w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center rounded-full border bg-card px-4 py-2.5 text-xs shadow-panel sm:px-5 sm:text-sm lg:absolute lg:left-1/2 lg:w-[min(48rem,calc(100%-25rem))] lg:-translate-x-1/2">
              <div className="flex min-w-0 items-center gap-2.5 border-r pr-3 sm:gap-3 sm:pr-5">
                <span className={cn("size-2 shrink-0 rounded-full", activeSession ? "bg-success" : "bg-muted-foreground")} />
                <span className="truncate text-muted-foreground">
                  {activeSession ? `${activeSession.session_name} aktif` : "Tidak ada perangkat terhubung"}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2 pl-3 sm:gap-3 sm:pl-5">
                <CalendarDays className="hidden size-4 shrink-0 text-primary sm:block" />
                <span className="hidden truncate text-muted-foreground md:inline">
                  {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
                </span>
                <span className="hidden text-muted-foreground md:inline">•</span>
                <Clock3 className="size-4 shrink-0 text-primary" />
                <span className="shrink-0 font-semibold tabular-nums">{clock.toLocaleTimeString("id-ID")}</span>
              </div>
            </div>
          )}


          <div className="col-start-3 ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "hidden gap-1.5",
                activeSession ? "border-primary/40 text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  activeSession ? "bg-primary" : "bg-muted-foreground",
                )}
              />
              {activeSession
                ? `${activeSession.session_name} aktif`
                : "Tidak ada perangkat terhubung"}
            </Badge>

            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Ganti tema">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu akun">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                      {account.username.slice(0, 2).toUpperCase() || "MB"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  @{account.username}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate({ to: adminLayout ? "/admin/pengaturan" : "/settings" })}
                >
                  <Settings className="mr-2 size-4" /> Pengaturan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 size-4" /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {adminLayout ? <AdminTopNav /> : null}



        <main className={cn("w-full min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6", !adminLayout && "bg-secondary/40 lg:px-10")}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex w-full min-w-0 flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground break-words">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{action}</div> : null}
    </div>
  );
}
