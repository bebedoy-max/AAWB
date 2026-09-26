/** Manajemen pengguna (pekerja): pencarian, saldo, perangkat, peran, dan tindakan akun. */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, CheckCircle2, Copy, KeyRound, RefreshCw, Search, Send, Smartphone, Trash2, UserRound, Users, Wallet } from "lucide-react";
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
  head: () => ({ meta: [
    { title: "Pengguna — NAROWA" },
    { name: "description", content: "Kelola akun Worker dan perangkat di NAROWA." },
    { property: "og:title", content: "Pengguna — NAROWA" },
    { property: "og:description", content: "Kelola akun Worker dan perangkat di NAROWA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PenggunaPage,
});

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Worker's",
};

type MemberSummary = {
  user_id: string;
  name: string;
  email: string;
  balance: number;
  pending_withdrawal: number;
  devices_online: number;
  devices_total: number;
  sent: number;
  last_sign_in_at: string | null;
  role: AppRole;
};

type ResetAccount = { id: string; email: string; name: string; username: string };
type ResetResult = { name: string; username: string; password: string };

function usernameFromEmail(email: string): string {
  return email.split("@")[0] || email;
}

function PenggunaPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyRole();
  const isSuper = Boolean(me?.is_super_admin);

  const fetchUsers = useServerFn(listAdminUsers);
  const changeRole = useServerFn(setMemberRole);
  const resetPassword = useServerFn(resetMemberPassword);
  const removeMember = useServerFn(deleteMember);

  const [q, setQ] = useState("");
  const [detailUser, setDetailUser] = useState<MemberSummary | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetAccount | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
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
    onSuccess: (result, variables) => {
      const target = resetTarget;
      setResetTarget(null);
      setResetResult({
        name: result.name || target?.name || "—",
        username: result.username || target?.username || "—",
        password: variables.password,
      });
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
          label="Total saldo Worker's"
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
        description="Klik baris untuk melihat detail lengkap pengguna."
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
          <TableShell className="min-w-0 lg:min-w-[640px]">
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Pengguna</Th>
                <Th>Saldo</Th>
                <Th className="hidden lg:table-cell">Perangkat</Th>
                <Th>Terkirim</Th>
                <Th className="hidden lg:table-cell">Terakhir masuk</Th>
                <Th className="hidden lg:table-cell">Peran</Th>
                <Th className="hidden text-right lg:table-cell">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.user_id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  onClick={() => setDetailUser(m)}
                >
                  <Td>
                    <p className="font-medium">{m.name}</p>
                  </Td>
                  <Td>
                    <p className="font-medium">{rupiah(m.balance)}</p>
                    {m.pending_withdrawal > 0 ? (
                      <p className="text-xs text-warning">
                        {rupiah(m.pending_withdrawal)} diajukan
                      </p>
                    ) : null}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <span className="text-sm">
                      {angka(m.devices_online)}/{angka(m.devices_total)}
                    </span>
                  </Td>
                  <Td>{angka(m.sent)}</Td>
                  <Td className="hidden text-muted-foreground lg:table-cell">{waktu(m.last_sign_in_at)}</Td>
                  <Td className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
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
                          <SelectItem value="member">Worker's</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABEL[m.role]}</Badge>
                    )}
                  </Td>
                  <Td className="hidden text-right lg:table-cell" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!isSuper}
                        onClick={() => {
                          setNewPassword("");
                          setResetTarget({
                            id: m.user_id,
                            email: m.email,
                            name: m.name,
                            username: usernameFromEmail(m.email),
                          });
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

      <Dialog open={Boolean(resetResult)} onOpenChange={(open) => !open && setResetResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <DialogTitle>Kata sandi berhasil disetel ulang</DialogTitle>
            <DialogDescription>
              Salin data berikut untuk diberikan kepada pengguna. Pop-up ini tidak menyimpan kata sandi.
            </DialogDescription>
          </DialogHeader>
          <dl className="divide-y rounded-lg border">
            <div className="grid grid-cols-[96px_1fr] gap-3 p-3 text-sm">
              <dt className="text-muted-foreground">Nama</dt>
              <dd className="break-words font-semibold">{resetResult?.name}</dd>
            </div>
            <div className="grid grid-cols-[96px_1fr] gap-3 p-3 text-sm">
              <dt className="text-muted-foreground">Username</dt>
              <dd className="break-all font-mono font-semibold">{resetResult?.username}</dd>
            </div>
            <div className="grid grid-cols-[96px_1fr] gap-3 p-3 text-sm">
              <dt className="text-muted-foreground">Password</dt>
              <dd className="flex min-w-0 items-center justify-between gap-2">
                <span className="break-all font-mono font-semibold">{resetResult?.password}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Salin password baru"
                  onClick={() => {
                    if (!resetResult?.password) return;
                    void navigator.clipboard.writeText(resetResult.password);
                    toast.success("Password disalin");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </dd>
            </div>
          </dl>
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>Tutup</Button>
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

      <MemberDetailDialog
        summary={detailUser}
        isSuper={isSuper}
        onRoleChange={(userId, role) => updateRole.mutate({ userId, role })}
        onReset={(m) => {
          setNewPassword("");
          setResetTarget({
            id: m.user_id,
            email: m.email,
            name: m.name,
            username: usernameFromEmail(m.email),
          });
        }}
        onDelete={(m) => setDeleteTarget({ id: m.user_id, email: m.email })}
        onClose={() => setDetailUser(null)}
      />
    </>
  );
}

function MemberDetailDialog({
  summary,
  isSuper,
  onRoleChange,
  onReset,
  onDelete,
  onClose,
}: {
  summary: MemberSummary | null;
  isSuper: boolean;
  onRoleChange: (userId: string, role: AppRole) => void;
  onReset: (m: MemberSummary) => void;
  onDelete: (m: MemberSummary) => void;
  onClose: () => void;
}) {
  const userId = summary?.user_id ?? null;
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

            {summary ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="break-all font-medium">{summary.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Saldo</dt>
                  <dd className="font-medium">{rupiah(summary.balance)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Penarikan diajukan</dt>
                  <dd className="font-medium">
                    {summary.pending_withdrawal > 0 ? rupiah(summary.pending_withdrawal) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Perangkat</dt>
                  <dd className="font-medium">
                    {angka(summary.devices_online)}/{angka(summary.devices_total)} terhubung
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Terkirim</dt>
                  <dd className="font-medium">{angka(summary.sent)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Terakhir masuk</dt>
                  <dd className="font-medium">{waktu(summary.last_sign_in_at)}</dd>
                </div>
                <div className="col-span-2 rounded-md bg-muted/50 p-2.5">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Send className="size-3.5" /> Akun Telegram
                  </dt>
                  {detail.telegram ? (
                    <dd className="mt-1 space-y-0.5">
                      <p className="font-medium">
                        {detail.telegram.first_name || "Nama tidak tersedia"}
                        {detail.telegram.username ? ` · @${detail.telegram.username}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID {detail.telegram.chat_id} · Ditautkan {waktu(detail.telegram.connected_at)}
                      </p>
                    </dd>
                  ) : (
                    <dd className="mt-1 text-sm font-medium">Belum tertaut</dd>
                  )}
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Peran</dt>
                  <dd className="mt-1">
                    {isSuper ? (
                      <Select
                        value={summary.role}
                        onValueChange={(role) => onRoleChange(summary.user_id, role as AppRole)}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Worker's</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABEL[summary.role]}</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            ) : null}

            {isSuper && summary ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onReset(summary)}>
                  <KeyRound className="mr-1 size-3.5" /> Setel ulang kata sandi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onDelete(summary)}
                >
                  <Trash2 className="mr-1 size-3.5" /> Hapus pengguna
                </Button>
              </div>
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
