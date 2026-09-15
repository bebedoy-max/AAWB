import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Profile } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Pengaturan — WBlast" },
      { name: "description", content: "Atur ruang kerja dan tampilan WBlast." },
      { property: "og:title", content: "Pengaturan — WBlast" },
      { property: "og:description", content: "Atur ruang kerja dan tampilan WBlast." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      setEmail(user.user?.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.user!.id)
        .maybeSingle();
      return (data ?? null) as Profile | null;
    },
  });

  useEffect(() => {
    if (profile?.organization_name) setOrg(profile.organization_name);
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user.user!.id, organization_name: org },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pengaturan berhasil disimpan");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Pengaturan" description="Atur ruang kerja dan tampilan aplikasi." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ruang kerja</CardTitle>
            <CardDescription>Ditampilkan di seluruh dasbor broadcast Anda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="org">Nama organisasi</Label>
              <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-email">Email akun</Label>
              <Input id="acc-email" value={email} disabled />
            </div>
            <Button onClick={() => save.mutate()}>Simpan perubahan</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tampilan</CardTitle>
            <CardDescription>Pilih tampilan terang atau gelap.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Mode gelap</p>
                <p className="text-xs text-muted-foreground">Saat ini {theme === "dark" ? "gelap" : "terang"}</p>
              </div>
              <Switch checked={theme === "dark"} onCheckedChange={toggle} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Gateway WhatsApp</CardTitle>
            <CardDescription>
              Perangkat, pemasangan QR, dan semua broadcast dijalankan melalui server Baileys Anda.
              Alamat dan kuncinya disimpan dengan aman.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Server Baileys Anda harus menyediakan alamat berikut:
            </p>
            <p className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              POST /sessions/:id/start · GET /sessions/:id/status · POST /sessions/:id/logout
            </p>
            <p className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              POST /sessions/:id/messages — {"{ to, text, mediaUrl? }"}
            </p>
            <p className="text-xs text-muted-foreground">
              Antrean diproses otomatis setiap menit, sehingga kampanye terjadwal tetap dikirim
              setelah halaman ini ditutup.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
