import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import {
  LayoutDashboard,
  Smartphone,
  Users,
  FileText,
  Send,
  ListChecks,
  Settings,
  Menu,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Wallet,
  Gift,
  Rocket,
  Activity,
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

/** Menu member/worker: hubungkan perangkat, blast, saldo. */
const MEMBER_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/devices", label: "Perangkat", icon: Smartphone },
  { to: "/blast", label: "Mulai Blast", icon: Rocket },
  { to: "/queue", label: "Log Pesan", icon: ListChecks },
  { to: "/rewards", label: "Saldo & Reward", icon: Wallet },
  { to: "/referral", label: "Referal", icon: Gift },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

/** Menu admin: monitoring, proyek blast, pengelolaan sistem. */
const ADMIN_NAV = [
  { to: "/monitor", label: "Monitoring", icon: Activity },
  { to: "/projects", label: "Proyek Blast", icon: Rocket },
  { to: "/contacts", label: "Kontak & Grup", icon: Users },
  { to: "/templates", label: "Template Pesan", icon: FileText },
  { to: "/campaigns", label: "Kampanye", icon: Send },
  { to: "/queue", label: "Antrean & Log", icon: ListChecks },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

const ALL_NAV = [...MEMBER_NAV, ...ADMIN_NAV];

function useIsAdmin(): boolean {
  const fetchRole = useServerFn(getMyRole);
  const { data } = useQuery({
    queryKey: ["my-role"],
    queryFn: () => fetchRole(),
    staleTime: 60_000,
  });
  return Boolean(data?.is_admin);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const items = isAdmin ? [...ADMIN_NAV] : [...MEMBER_NAV];

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
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


function Brand() {
  return (
    <div className="flex items-center px-5 pt-5 pb-1">
      <BrandLogo className="h-24 max-w-full" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const linkReferral = useServerFn(attachReferral);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
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

  const current = ALL_NAV.find((n) => n.to === pathname);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar lg:block">
        <div className="sticky top-0">
          <Brand />
          <NavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigasi</SheetTitle>
              <Brand />
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">AAWB</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="truncate font-medium">{current?.label ?? "Ringkasan"}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "hidden gap-1.5 sm:inline-flex",
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
                      {email.slice(0, 2).toUpperCase() || "WB"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {email || "Sudah masuk"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                  <Settings className="mr-2 size-4" /> Pengaturan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 size-4" /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="w-full min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-6">
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
