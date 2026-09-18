/** Tim manajer: daftar admin & super admin dan pengelolaan perannya. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { setMemberRole, type AppRole } from "@/lib/admin.functions";
import { listPromotableUsers, listStaff } from "@/lib/admin-console.functions";
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
  member: "Member",
};

function TimPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMyRole();
  const isSuper = Boolean(me?.is_super_admin);

  const fetchStaff = useServerFn(listStaff);
  const fetchCandidates = useServerFn(listPromotableUsers);
  const changeRole = useServerFn(setMemberRole);

  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [role, setRole] = useState<AppRole>("admin");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () => fetchStaff(),
  });

  const { data: candidates } = useQuery({
    queryKey: ["admin-promotable"],
    enabled: isSuper && open,
    queryFn: () => fetchCandidates(),
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
      setOpen(false);
      setCandidate("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const admins = (data ?? []).filter((s) => s.role === "admin").length;
  const supers = (data ?? []).filter((s) => s.role === "super_admin").length;

  return (
    <>
      <AdminPageTitle
        title="Tim Manajer"
        description="Daftar admin dan super admin yang memiliki akses ke konsol ini."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
              Muat ulang
            </Button>
            {isSuper ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <UserPlus className="mr-2 size-4" />
                    Angkat admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Angkat pengguna menjadi admin</DialogTitle>
                    <DialogDescription>
                      Pilih member yang akan diberi akses konsol admin.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Pengguna</Label>
                      <Select value={candidate} onValueChange={setCandidate}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih member" />
                        </SelectTrigger>
                        <SelectContent>
                          {(candidates ?? []).map((c) => (
                            <SelectItem key={c.user_id} value={c.user_id}>
                              {c.name} — {c.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Peran</Label>
                      <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                      Batal
                    </Button>
                    <Button
                      disabled={!candidate || update.isPending}
                      onClick={() => update.mutate({ userId: candidate, role })}
                    >
                      Simpan
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </>
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
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABEL[s.role]}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Panel>

      {!isSuper ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Hanya Super Admin yang dapat mengubah peran anggota tim.
        </p>
      ) : null}
    </>
  );
}
