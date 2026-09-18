import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/my-client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sesi disimpan di peramban dan kadang baru selesai dipulihkan sesaat
    // setelah login, jadi tunggu sebentar sebelum menolak akses.
    let session = (await supabase.auth.getSession()).data.session;
    const started = Date.now();
    while (!session && Date.now() - started < 3000) {
      await new Promise((r) => setTimeout(r, 150));
      session = (await supabase.auth.getSession()).data.session;
    }
    if (!session) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
