/** Tim manajer: daftar admin & super admin dan pengelolaan perannya. */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail, Pencil, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { setMemberRole, type AppRole } from "@/lib/admin.functions";
import {
  listStaff,
  requestStaffEmailChange,
  requestStaffPasswordReset,
  updateStaffName,
} from "@/lib/admin-console.functions";
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
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/tim")({
  head: () => ({ meta: [
    { title: "Tim Admin — NAROWA" },
    { name: "description", content: "Kelola anggota tim admin NAROWA." },
    { property: "og:title", content: "Tim Admin — NAROWA" },
    { property: "og:description", content: "Kelola anggota tim admin NAROWA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TimPage,
});

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  member: "Worker's",
};

function TimPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyRole();
  const isSuper = Boolean(me?.is_super_admin);

  const fetchStaff = useServerFn(listStaff);
  const changeRole = useServerFn(setMemberRole);
  const changeEmail = useServerFn(requestStaffEmailChange);
  const requestPasswordReset = useServerFn(requestStaffPasswordReset);

  const [emailTarget, setEmailTarget] = useState<{ user_id: string; name: string } | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const renameStaff = useServerFn(updateStaffName);


  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () => fetchStaff(),
    // Pantau hanya bila ada permintaan ganti email yang belum diverifikasi.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => s.email_pending) ? 5000 : false,
  });

  // Penghitung mundur masa berlaku tautan (3 menit).
  const hasPending = (data ?? []).some((s) => s.email_pending);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasPending]);

  const sisaWaktu = (iso: string | null) => {
    if (!iso) return null;
    const ms = Date.parse(iso) - now;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
    queryClient.invalidateQueries({ queryKey: ["admin-promotable"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const update = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole }) => changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Peran berhasil diperbarui");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendEmail = useMutation({
    mutationFn: (vars: { userId: string; email: string }) =>
      changeEmail({
        data: {
          ...vars,
          origin: typeof window === "undefined" ? "" : window.location.origin,
        },
      }),
    onSuccess: () => {
      toast.success(
        "Tautan verifikasi dikirim ke email baru. Berlaku 3 menit — cek juga folder spam/junk.",
      );

      setEmailTarget(null);
      setEmailValue("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveName = useMutation({
    mutationFn: (name: string) => renameStaff({ data: { name } }),
    onSuccess: ({ name }) => {
      toast.success(`Nama berhasil diubah menjadi ${name}.`);
      setNameOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReset = useMutation({
    mutationFn: (userId: string) =>
      requestPasswordReset({
        data: {
          userId,
          origin: typeof window === "undefined" ? "" : window.location.origin,
        },
      }),
    onSuccess: ({ email }) =>
      toast.success(`OTP ganti kata sandi sudah dikirim ke ${email}.`),
    onError: (e: Error) => toast.error(e.message),
  });

  const admins = (data ?? []).filter((s) => s.role === "admin").length;
  const supers = (data ?? []).filter((s) => s.role === "super_admin").length;
  const superPenuh = supers >= 2;
  const adminPenuh = admins >= 3;

  return (
    <>
      <AdminPageTitle
        title="Tim Manajer"
        description="Daftar admin dan super admin yang memiliki akses ke konsol ini."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
            Muat ulang
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total tim" value={angka(data?.length ?? 0)} icon={Users} tone="info" />
        <StatTile label="Super admin" value={angka(supers)} icon={ShieldCheck} tone="primary" />
        <StatTile label="Admin" value={angka(admins)} icon={ShieldCheck} tone="success" />
      </div>

      <Panel className="mt-4" title="Anggota tim" bodyClassName="p-0">
        {error ? (
          <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : (data ?? []).length === 0 ? (
          <EmptyState title="Belum ada anggota tim" />
        ) : (
          <TableShell>
            <thead className="border-b bg-muted/40">
              <tr>
                <Th>Nama</Th>
                <Th>Email</Th>
                <Th>Peran</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.user_id} className="border-b last:border-0 hover:bg-muted/40">
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="text-muted-foreground">{s.email}</Td>
                  <Td>
                    {isSuper ? (
                      <Select
                        value={s.role}
                        onValueChange={(v) =>
                          update.mutate({ userId: s.user_id, role: v as AppRole })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value="super_admin"
                            disabled={superPenuh && s.role !== "super_admin"}
                          >
                            Super Admin {superPenuh && s.role !== "super_admin" ? "(kuota penuh)" : ""}
                          </SelectItem>
                          <SelectItem value="admin" disabled={adminPenuh && s.role !== "admin"}>
                            Admin {adminPenuh && s.role !== "admin" ? "(kuota penuh)" : ""}
                          </SelectItem>
                          <SelectItem value="member">Worker's</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABEL[s.role]}</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                    {s.user_id === me?.user_id ? (
                      <Button
                        size="sm"
                        variant={s.email_pending ? "secondary" : "outline"}
                        disabled={s.email_pending}
                        onClick={() => {
                          setEmailTarget({ user_id: s.user_id, name: s.name });
                          setEmailValue(s.needs_real_email ? "" : s.email);
                        }}
                      >
                        {s.email_pending ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Menunggu verifikasi
                            {sisaWaktu(s.expires_at) ? ` (${sisaWaktu(s.expires_at)})` : ""}
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 size-4" />
                            Ubah email
                          </>
                        )}
                      </Button>
                    ) : s.email_pending ? (
                      <Badge variant="secondary">
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        Menunggu verifikasi
                      </Badge>
                    ) : s.needs_real_email ? (
                      <Badge variant="outline">Belum ditautkan</Badge>
                    ) : (
                      <Badge variant="outline">Terverifikasi</Badge>
                    )}
                    {s.user_id === me?.user_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNameValue(s.name);
                          setNameOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 size-4" />
                        Ubah nama
                      </Button>
                    ) : null}
                    {s.user_id === me?.user_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendReset.isPending}
                        onClick={() => sendReset.mutate(s.user_id)}
                      >
                        {sendReset.isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <KeyRound className="mr-2 size-4" />
                        )}
                        Ubah password
                      </Button>
                    ) : null}
                    </div>
                  </Td>

                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      <p className="mt-3 text-xs text-muted-foreground">
        {isSuper
          ? "Kuota tim: maksimal 2 Super Admin dan 3 Admin. Email asli wajib diverifikasi pemiliknya."
          : "Hanya Super Admin yang dapat mengubah peran anggota tim."}
      </p>

      <Dialog
        open={Boolean(emailTarget)}
        onOpenChange={(v) => {
          if (!v) setEmailTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah email {emailTarget?.name}</DialogTitle>
            <DialogDescription>
              Masukkan email asli. Email lama tetap dipakai sampai pemilik alamat baru membuka
              tautan verifikasi yang dikirim ke alamat tersebut.
            </DialogDescription>

          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Email baru</Label>
            <Input
              type="email"
              value={emailValue}
              placeholder="nama@perusahaan.com"
              onChange={(e) => setEmailValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={!emailValue.trim() || sendEmail.isPending}
              onClick={() =>
                emailTarget &&
                sendEmail.mutate({ userId: emailTarget.user_id, email: emailValue.trim() })
              }
            >
              {sendEmail.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Kirim verifikasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={nameOpen}
        onOpenChange={(v) => {
          if (!v) setNameOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah nama</DialogTitle>
            <DialogDescription>
              Nama ini tampil di konsol admin dan daftar tim.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nama baru</Label>
            <Input
              value={nameValue}
              placeholder="Nama lengkap"
              onChange={(e) => setNameValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNameOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={nameValue.trim().length < 2 || saveName.isPending}
              onClick={() => saveName.mutate(nameValue.trim())}
            >
              {saveName.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>


  );
}
