import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, PlugZap } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getGatewaySettings,
  getMyRole,
  listMembers,
  saveGatewaySettings,
  setMemberRole,
  testGateway,
  type AppRole,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — WBlast" },
      { name: "description", content: "Atur gateway WhatsApp dan peran pengguna WBlast." },
      { property: "og:title", content: "Admin — WBlast" },
      { property: "og:description", content: "Atur gateway WhatsApp dan peran pengguna WBlast." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
};

function AdminPage() {
  const queryClient = useQueryClient();
  const fetchRole = useServerFn(getMyRole);
  const fetchSettings = useServerFn(getGatewaySettings);
  const persistSettings = useServerFn(saveGatewaySettings);
  const runTest = useServerFn(testGateway);
  const fetchMembers = useServerFn(listMembers);
  const changeRole = useServerFn(setMemberRole);

  const { data: me, isLoading: roleLoading } = useQuery({
    queryKey: ["my-role"],
    queryFn: () => fetchRole(),
  });

  const isAdmin = Boolean(me?.is_admin);
  const isSuper = Boolean(me?.is_super_admin);

  const { data: settings } = useQuery({
    queryKey: ["gateway-settings"],
    enabled: isAdmin,
    queryFn: () => fetchSettings(),
  });

  const { data: members } = useQuery({
    queryKey: ["members"],
    enabled: isSuper,
    queryFn: () => fetchMembers(),
  });

  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

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

  const updateRole = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole }) => changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Peran pengguna diperbarui");
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roleLoading) {
    return <p className="text-sm text-muted-foreground">Memuat…</p>;
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Admin" description="Area khusus admin." />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Anda tidak memiliki akses ke halaman ini.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Atur gateway WhatsApp dan peran pengguna."
        action={
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            {ROLE_LABEL[(me?.role ?? "member") as AppRole]}
          </Badge>
        }
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gateway WhatsApp</CardTitle>
            <CardDescription>
              Alamat server wa-gateway dan kunci API-nya. Nilai ini dipakai untuk pemasangan QR dan
              semua pengiriman pesan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pengguna & peran</CardTitle>
            <CardDescription>
              Akun pertama yang mendaftar otomatis menjadi Super Admin. Super Admin dapat menjadikan
              anggota lain sebagai Admin atau Member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isSuper ? (
              <p className="text-sm text-muted-foreground">
                Hanya Super Admin yang dapat mengubah peran pengguna.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Terdaftar</th>
                      <th className="py-2 pr-4 font-medium">Terakhir masuk</th>
                      <th className="py-2 font-medium">Peran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(members ?? []).map((m) => (
                      <tr key={m.user_id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{m.email}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString("id-ID")}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {m.last_sign_in_at
                            ? new Date(m.last_sign_in_at).toLocaleDateString("id-ID")
                            : "—"}
                        </td>
                        <td className="py-2">
                          <Select
                            value={m.role}
                            onValueChange={(role) =>
                              updateRole.mutate({ userId: m.user_id, role: role as AppRole })
                            }
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">Super Admin</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                    {members && members.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          Belum ada pengguna.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
