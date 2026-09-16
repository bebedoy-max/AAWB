import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, PlugZap, KeyRound, Trash2, Camera, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteMember,
  getGatewaySettings,
  getMemberDetail,
  getMyRole,
  listMembers,
  resetMemberPassword,
  saveGatewaySettings,
  setMemberRole,
  setMemberWaName,
  setMemberWaPicture,
  testGateway,
  type AppRole,
} from "@/lib/admin.functions";
import { AdminRewardSettings, AdminWithdrawals } from "@/components/admin-rewards";


export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — AAWB" },
      { name: "description", content: "Atur gateway WhatsApp dan peran pengguna AAWB." },
      { property: "og:title", content: "Admin — AAWB" },
      { property: "og:description", content: "Atur gateway WhatsApp dan peran pengguna AAWB." },
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
  const resetPassword = useServerFn(resetMemberPassword);
  const removeMember = useServerFn(deleteMember);

  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [detailUser, setDetailUser] = useState<string | null>(null);


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

  const doReset = useMutation({
    mutationFn: (vars: { userId: string; password: string }) => resetPassword({ data: vars }),
    onSuccess: () => {
      toast.success("Kata sandi pengguna berhasil disetel ulang");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doDelete = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { userId } }),
    onSuccess: () => {
      toast.success("Pengguna berhasil dihapus");
      setDeleteTarget(null);
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

      <Tabs defaultValue="gateway" className="space-y-4">
        <TabsList
          className={cn("grid h-auto w-full max-w-full", isSuper ? "grid-cols-4" : "grid-cols-3")}
        >
          <TabsTrigger value="gateway" className="px-1.5 text-xs sm:px-3 sm:text-sm">
            Gateway
          </TabsTrigger>
          {isSuper ? (
            <TabsTrigger value="reward" className="px-1.5 text-xs sm:px-3 sm:text-sm">
              Reward
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="withdrawal" className="px-1.5 text-xs sm:px-3 sm:text-sm">
            Penarikan
          </TabsTrigger>
          <TabsTrigger value="users" className="px-1.5 text-xs sm:px-3 sm:text-sm">
            Pengguna
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gateway" className="space-y-4">
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
        </TabsContent>

        {isSuper ? (
          <TabsContent value="reward" className="space-y-4">
            <AdminRewardSettings />
          </TabsContent>
        ) : null}

        <TabsContent value="withdrawal" className="space-y-4">
          <AdminWithdrawals />
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
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
                        <th className="py-2 pr-4 font-medium">Nama</th>
                        <th className="py-2 pr-4 font-medium">Email</th>
                        <th className="py-2 pr-4 font-medium">Terdaftar</th>
                        <th className="py-2 pr-4 font-medium">Terakhir masuk</th>
                        <th className="py-2 pr-4 font-medium">Peran</th>
                        <th className="py-2 font-medium">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(members ?? []).map((m) => (
                        <tr
                          key={m.user_id}
                          className="cursor-pointer border-b last:border-0 hover:bg-accent/40"
                          onClick={() => setDetailUser(m.user_id)}
                        >
                          <td className="py-2 pr-4 font-medium">{m.name}</td>
                          <td className="py-2 pr-4">{m.email}</td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {new Date(m.created_at).toLocaleDateString("id-ID")}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {m.last_sign_in_at
                              ? new Date(m.last_sign_in_at).toLocaleDateString("id-ID")
                              : "—"}
                          </td>
                          <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={m.role}
                              onValueChange={(role) =>
                                updateRole.mutate({ userId: m.user_id, role: role as AppRole })
                              }
                            >
                              <SelectTrigger className="w-full sm:w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="super_admin">Super Admin</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setNewPassword("");
                                  setResetTarget({ id: m.user_id, email: m.email });
                                }}
                              >
                                <KeyRound className="mr-1 size-3.5" /> Reset sandi
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => setDeleteTarget({ id: m.user_id, email: m.email })}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {members && members.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
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
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setel ulang kata sandi</DialogTitle>
            <DialogDescription>
              Tentukan kata sandi baru untuk {resetTarget?.email}. Beri tahu penggunanya agar
              segera menggantinya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-pass">Kata sandi baru</Label>
            <Input
              id="new-pass"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={doReset.isPending}
              onClick={() =>
                resetTarget && doReset.mutate({ userId: resetTarget.id, password: newPassword })
              }
            >
              Simpan kata sandi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengguna ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun {deleteTarget?.email} akan dihapus permanen beserta perannya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && doDelete.mutate(deleteTarget.id)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberDetailDialog userId={detailUser} onClose={() => setDetailUser(null)} />
    </>
  );
}

function MemberDetailDialog({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getMemberDetail);
  const saveWaName = useServerFn(setMemberWaName);
  const saveWaPicture = useServerFn(setMemberWaPicture);
  const [waName, setWaName] = useState("");

  const { data: detail, isLoading } = useQuery({
    queryKey: ["member-detail", userId],
    enabled: Boolean(userId),
    queryFn: () => fetchDetail({ data: { userId: userId as string } }),
  });

  useEffect(() => {
    setWaName(detail?.wa_name ?? "");
  }, [detail?.wa_name, userId]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["member-detail", userId] });

  const renameWa = useMutation({
    mutationFn: () => saveWaName({ data: { userId: userId as string, name: waName } }),
    onSuccess: () => {
      toast.success("Nama WhatsApp berhasil diubah");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePhoto = useMutation({
    mutationFn: (dataUrl: string) =>
      saveWaPicture({ data: { userId: userId as string, dataUrl } }),
    onSuccess: () => {
      toast.success("Foto profil WhatsApp berhasil diubah");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pickPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => changePhoto.mutate(String(reader.result));
    reader.readAsDataURL(file);
  };

  const connected = detail?.session_status === "connected";

  return (
    <Dialog open={Boolean(userId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detail pengguna</DialogTitle>
          <DialogDescription>
            Nama dan foto di bawah adalah profil WhatsApp asli pada perangkat pengguna ini.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !detail ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="size-20 shrink-0 overflow-hidden rounded-full bg-muted">
                {detail.wa_picture ? (
                  <img
                    src={detail.wa_picture}
                    alt={`Foto profil WhatsApp ${detail.name}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <UserRound className="size-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-semibold">{detail.name}</p>
                <p className="text-muted-foreground">{detail.email}</p>
                <p className="text-muted-foreground">
                  {detail.wa_phone ? `+${detail.wa_phone}` : "Nomor belum tersedia"}
                </p>
                <Badge variant="outline">{ROLE_LABEL[detail.role]}</Badge>
              </div>
            </div>

            {detail.wa_error ? (
              <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                {detail.wa_error}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="wa-name">Nama WhatsApp</Label>
              <div className="flex gap-2">
                <Input
                  id="wa-name"
                  value={waName}
                  onChange={(e) => setWaName(e.target.value)}
                  placeholder="Nama yang tampil di WhatsApp"
                  disabled={!connected}
                />
                <Button
                  onClick={() => renameWa.mutate()}
                  disabled={!connected || renameWa.isPending || !waName.trim()}
                >
                  Simpan
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Foto profil WhatsApp</Label>
              <Button variant="outline" asChild disabled={!connected}>
                <label className="cursor-pointer">
                  <Camera className="mr-1 size-4" />
                  {changePhoto.isPending ? "Mengunggah…" : "Ganti foto profil"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={!connected || changePhoto.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) pickPhoto(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {!connected ? (
                <p className="text-xs text-muted-foreground">
                  Perubahan hanya bisa dilakukan saat perangkat WhatsApp pengguna terhubung.
                </p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

