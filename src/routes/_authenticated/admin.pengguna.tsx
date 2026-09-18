/** Manajemen pengguna (pekerja): pencarian, saldo, perangkat, peran, dan tindakan akun. */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, KeyRound, RefreshCw, Search, Smartphone, Trash2, UserRound, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  getMemberDetail,
  resetMemberPassword,
  setMemberRole,
  setMemberWaName,
  setMemberWaPicture,
  type AppRole,
} from "@/lib/admin.functions";
import { listAdminUsers } from "@/lib/admin-console.functions";
import { useMyRole } from "./admin";
import {
  AdminPageTitle,
  EmptyState,
  Panel,
  StatTile,
  TableShell,
  Td,
  Th,
  angka,
  rupiah,
  waktu,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/pengguna")({
  component: PenggunaPage,
});

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Member",
};

function PenggunaPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyRole();
  const isSuper = Boolean(me?.is_super_admin);

  const fetchUsers = useServerFn(listAdminUsers);
  const changeRole = useServerFn(setMemberRole);
  const resetPassword = useServerFn(resetMemberPassword);
  const removeMember = useServerFn(deleteMember);

  const [q, setQ] = useState("");
  const [detailUser, setDetailUser] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) =>
      [r.name, r.email].some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const updateRole = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole }) => changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Peran pengguna diperbarui");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doReset = useMutation({
    mutationFn: (vars: { userId: string; password: string }) => resetPassword({ data: vars }),
    onSuccess: () => {
      toast.success("Kata sandi berhasil disetel ulang");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doDelete = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { userId } }),
    onSuccess: () => {
      toast.success("Pengguna dihapus");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AdminPageTitle
        title="Manajemen Pengguna"
        description="Daftar pekerja beserta saldo, perangkat, dan riwayat pengiriman."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
            Muat ulang
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total pengguna" value={angka(data?.rows.length ?? 0)} icon={Users} tone="info" />
        <StatTile
          label="Total saldo member"
          value={rupiah(data?.balance_total ?? 0)}
          hint={`${rupiah(data?.pending_total ?? 0)} menunggu pencairan`}
          icon={Wallet}
          tone="primary"
        />
        <StatTile
          label="Perangkat terdaftar"
          value={angka(data?.total_devices ?? 0)}
          icon={Smartphone}
          tone="muted"
        />
        <StatTile
          label="Perangkat terhubung"
          value={angka(data?.devices_online ?? 0)}
          icon={Smartphone}
          tone="success"
        />
      </div>

      <Panel
        className="mt-4"
        title="Daftar pengguna"
        description="Klik baris untuk melihat profil WhatsApp pengguna."
        bodyClassName="p-0"
        action={
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama atau email"
              className="pl-8"
            />
          </div>
        }
      >
        {error ? (
          <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada pengguna"
            description="Pengguna yang mendaftar akan muncul di sini."
          />
        ) : (
          <TableShell>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Pengguna</Th>
                <Th>Saldo</Th>
                <Th>Perangkat</Th>
                <Th>Terkirim</Th>
                <Th>Terakhir masuk</Th>
                <Th>Peran</Th>
                <Th className="text-right">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.user_id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  onClick={() => setDetailUser(m.user_id)}
                >
                  <Td>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </Td>
                  <Td>
                    <p className="font-medium">{rupiah(m.balance)}</p>
                    {m.pending_withdrawal > 0 ? (
                      <p className="text-xs text-warning">
                        {rupiah(m.pending_withdrawal)} diajukan
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="text-sm">
                      {angka(m.devices_online)}/{angka(m.devices_total)}
                    </span>
                  </Td>
                  <Td>{angka(m.sent)}</Td>
                  <Td className="text-muted-foreground">{waktu(m.last_sign_in_at)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {isSuper ? (
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          updateRole.mutate({ userId: m.user_id, role: role as AppRole })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABEL[m.role]}</Badge>
                    )}
                  </Td>
                  <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!isSuper}
                        onClick={() => {
                          setNewPassword("");
                          setResetTarget({ id: m.user_id, email: m.email });
                        }}
                      >
                        <KeyRound className="mr-1 size-3.5" /> Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={!isSuper}
                        onClick={() => setDeleteTarget({ id: m.user_id, email: m.email })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setel ulang kata sandi</DialogTitle>
            <DialogDescription>
              Tentukan kata sandi baru untuk {resetTarget?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-pass">Kata sandi baru</Label>
            <Input
              id="new-pass"
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
              Simpan
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
            <AlertDialogAction onClick={() => deleteTarget && doDelete.mutate(deleteTarget.id)}>
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
    mutationFn: (dataUrl: string) => saveWaPicture({ data: { userId: userId as string, dataUrl } }),
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
