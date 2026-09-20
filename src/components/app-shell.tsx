import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  LayoutDashboard,
  Smartphone,
  Users,
  Send,
  Settings,
  Menu,
  LogOut,
  ShieldCheck,
  Wallet,
  HandCoins,
  Network,
  Home,
  CalendarDays,
  ListChecks,
  FileText,
  Clock3,
  Globe2,
} from "lucide-react";

import { getMyRole } from "@/lib/admin.functions";
import { attachReferral } from "@/lib/rewards.functions";

import { supabase } from "@/integrations/supabase/my-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

/** Menu member utama mengikuti alur ringkas pada referensi. */
const MEMBER_NAV = [
  { to: "/dashboard", label: "Beranda", icon: Home },
  { to: "/devices", label: "WhatsApp", icon: Smartphone },
  { to: "/rewards", label: "Klaim Saldo", icon: HandCoins },
  { to: "/referral", label: "Tim Afiliasi", icon: Network },
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

/** Menu monitoring yang tersedia pada navigasi bawah admin di ponsel. */
const ADMIN_MOBILE_NAV = [
  { to: "/admin", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/admin/pengguna", label: "Pengguna", icon: Users },
  { to: "/admin/laporan", label: "Laporan", icon: FileText },
  { to: "/admin/klaim", label: "Klaim Dana", icon: Wallet },
] as const;

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

function NavLinks({ onNavigate, adminMode = false }: { onNavigate?: () => void; adminMode?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const items = adminMode || isAdmin ? [...ADMIN_NAV] : [...MEMBER_NAV];

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
    <div className="px-3 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-center gap-2 overflow-x-auto rounded-b-xl bg-card px-3 py-2 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

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
      </div>
    </div>
  );
}


function Brand() {
  return (
    <div className="flex h-[76px] items-center gap-1.5 overflow-hidden border-b px-3">
      <BrandLogo className="h-12 w-auto shrink-0 object-contain" />
      <div className="min-w-0 border-l pl-1.5">
        <p className="text-base font-bold leading-tight">Worker's</p>
      </div>

    </div>
  );
}

function MemberMobileHeader({ onSettings, onSignOut }: { onSettings: () => void; onSignOut: () => void }) {
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="grid h-[4.25rem] w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center overflow-hidden rounded-[1.25rem] border bg-card px-3 shadow-panel lg:hidden">
      <span className="min-w-0 truncate pr-3 text-xs text-foreground">{date}</span>
      <span className="flex h-8 shrink-0 items-center gap-2 border-l px-3 text-sm font-semibold">
        <Globe2 className="size-5 text-muted-foreground" /> ID
      </span>
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={onSettings} aria-label="Pengaturan akun">
        <Settings className="size-5" />
      </Button>
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={onSignOut} aria-label="Keluar">
        <LogOut className="size-5" />
      </Button>
    </div>
  );
}

function MemberBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex w-[23rem] max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 lg:hidden">
      <nav className="grid h-[4.5rem] min-w-0 flex-1 grid-cols-4 items-center rounded-[2rem] border bg-card/95 px-3 shadow-glow backdrop-blur">
        {MEMBER_NAV.map(({ to, label, icon: Icon }) => {
          const active = isActivePath(pathname, to);
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              className={cn(
                "mx-auto grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors",
                active && "border bg-background text-foreground shadow-panel",
              )}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </nav>
      <Link to="/settings" aria-label="Buka Telegram" className="grid size-14 shrink-0 place-items-center rounded-full bg-info text-info-foreground shadow-glow">
        <Send className="size-6" />
      </Link>
    </div>
  );
}

function AdminBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed bottom-5 left-1/2 z-40 grid h-[4.5rem] w-[23rem] max-w-[calc(100%-1.5rem)] -translate-x-1/2 grid-cols-4 items-center rounded-[2rem] border bg-card/95 px-3 shadow-glow backdrop-blur lg:hidden"
      aria-label="Navigasi admin"
    >
      {ADMIN_MOBILE_NAV.map(({ to, label, icon: Icon }) => {
        const active = isActivePath(pathname, to);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            title={label}
            className={cn(
              "mx-auto grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors",
              active && "border bg-background text-foreground shadow-panel",
            )}
          >
            <Icon className="size-5" />
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState({ username: "member", name: "Worker's" });
  const [clock, setClock] = useState(new Date());
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const linkReferral = useServerFn(attachReferral);
  const fetchRole = useServerFn(getMyRole);

  const { data: myRole } = useQuery({
    queryKey: ["my-role"],
    queryFn: () => fetchRole(),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      const metadata = user?.user_metadata as {
        username?: string;
        organization_name?: string;
        full_name?: string;
        name?: string;
      } | undefined;
      const { data: profile } = user
        ? await supabase.from("profiles").select("organization_name").eq("user_id", user.id).maybeSingle()
        : { data: null };
      const username = metadata?.username ?? user?.email?.split("@")[0] ?? "member";
      setAccount({
        username,
        name:
          profile?.organization_name ??
          metadata?.organization_name ??
          metadata?.full_name ??
          metadata?.name ??
          username,
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

  // Konsol admin memakai tata letak bar atas horizontal (seperti referensi),
  // sedangkan area member tetap memakai sidebar.
  const adminLayout = pathname === "/admin" || pathname.startsWith("/admin/");

  const queryClient = useQueryClient();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  // Admin & super admin: keluar otomatis setelah 15 menit tanpa aktivitas.
  // Worker (member) tetap masuk sampai menekan tombol keluar sendiri.
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const isAdminAccount = !!myRole?.is_admin;

  useEffect(() => {
    if (!isAdminAccount) return;
    const IDLE_MS = 15 * 60 * 1000;
    let timer: number | undefined;

    const logoutIdle = () => {
      toast.info("Anda keluar otomatis karena 15 menit tidak ada aktivitas.");
      void signOutRef.current();
    };

    const reset = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(logoutIdle, IDLE_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisible);
    reset();

    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAdminAccount]);


  return (
    <div className={cn("flex min-h-screen w-full max-w-full overflow-x-hidden bg-background member-surface", adminLayout && "lg:font-sans")}>
      {adminLayout ? null : (
        <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <Brand />
            <p className="px-6 pb-2 pt-2 text-[10px] font-bold uppercase text-muted-foreground">Menu utama</p>
            <NavLinks />
            <div className="mt-auto border-t p-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
                    title="Menu akun"
                  >
                    <p className="truncate text-sm font-bold">{account.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">@{account.username}</p>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel>
                    <span className="block truncate text-sm font-semibold">{account.name}</span>
                    <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">@{account.username}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/pengaturan-akun" })}>
                    <Settings className="mr-2 size-4" /> Pengaturan Akun
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 size-4" /> Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">

        <header className={cn(
          "px-4 lg:px-6",
          adminLayout
            ? "fixed inset-x-0 top-0 z-50 h-[5.5rem] bg-transparent px-2 pt-2 lg:sticky lg:h-[4.75rem] lg:border-b lg:bg-background/85 lg:px-6 lg:py-1 lg:backdrop-blur"
            : "fixed inset-x-0 top-0 z-50 h-[5.5rem] bg-transparent px-2 pt-2 lg:sticky lg:h-20 lg:bg-background/85 lg:px-6 lg:pt-0 lg:backdrop-blur",
        )}>
          <div className={cn(
            "grid h-full w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3",
            adminLayout && "mx-auto max-w-[1400px]",
          )}>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden" aria-label="Buka menu">
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
            <Link to="/admin" className="hidden min-w-0 items-center gap-2 lg:flex">
              <BrandLogo className="h-12 max-w-[200px] shrink-0" />
              <span className="hidden truncate text-sm font-semibold sm:inline">Admin</span>
            </Link>
          ) : (
            <div className="hidden mx-auto min-w-0 w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center rounded-full border bg-card px-4 py-2.5 text-xs shadow-panel sm:px-5 sm:text-sm lg:absolute lg:left-1/2 lg:grid lg:w-[min(48rem,calc(100%-25rem))] lg:-translate-x-1/2">
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

          <div className="col-span-3 w-full lg:hidden">
            <MemberMobileHeader
              onSettings={() => navigate({ to: adminLayout ? "/admin/pengaturan" : "/settings" })}
              onSignOut={() => void signOut()}
            />
          </div>

          {adminLayout ? (
          <div className="col-start-3 ml-auto hidden items-center lg:flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto gap-3 px-2 py-1.5" aria-label="Menu akun admin">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                      {account.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase() || "AD"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-left leading-tight">
                    <span className="block text-sm font-semibold">{account.name}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {myRole?.is_super_admin ? "Super Admin" : "Admin"}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block text-sm font-semibold">{account.name}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {myRole?.is_super_admin ? "Super Admin" : "Admin"}
                  </span>
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
          ) : null}
          </div>
        </header>


        {adminLayout ? <div className="hidden lg:block"><AdminTopNav /></div> : null}



        <main className={cn(
          "w-full min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6",
          !adminLayout && "bg-secondary/40 pb-32 pt-[6.25rem] lg:px-10 lg:pb-6 lg:pt-6",
          adminLayout && "bg-secondary/40 pb-32 pt-[6.25rem] lg:bg-background lg:pb-6 lg:pt-6",
        )}> 
          {children}
        </main>
        {adminLayout ? <AdminBottomNav /> : <MemberBottomNav />}
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
    <div className="mb-6 flex w-full min-w-0 flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-[1.65rem] font-bold tracking-normal break-words sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground break-words">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{action}</div> : null}
    </div>
  );
}
