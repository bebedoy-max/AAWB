/** Tim manajer: daftar admin & super admin dan pengelolaan perannya. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, ShieldCheck, Users } from "lucide-react";
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
  waktu,
} from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin/tim")({
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

  const [emailTarget, setEmailTarget] = useState<{ user_id: string; name: string } | null>(null);
  const [emailValue, setEmailValue] = useState("");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () => fetchStaff(),
    // Pantau hanya bila ada permintaan ganti email yang belum diverifikasi.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => s.email_pending) ? 15000 : false,
  });


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
    mutationFn: (vars: { userId: string; email: string }) => changeEmail({ data: vars }),
    onSuccess: () => {
      toast.success("Email diperbarui. Menunggu verifikasi dari pemilik email.");
      setEmailTarget(null);
      setEmailValue("");
      invalidate();
    },
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
                <Th>Bergabung</Th>
                <Th>Peran</Th>
                <Th>Email asli</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.user_id} className="border-b last:border-0 hover:bg-muted/40">
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="text-muted-foreground">{s.email}</Td>
                  <Td className="text-muted-foreground">{waktu(s.created_at)}</Td>
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
                    {isSuper ? (
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
              Masukkan email asli. Tautan verifikasi dikirim ke alamat tersebut dan tombol akan
              terkunci sampai email terverifikasi.
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
    </>
  );
}
