/** Panel "Black List" (khusus super admin): nomor pengirim yang tidak boleh ikut blast. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, EmptyState, TableShell, Td, Th, waktu } from "@/components/admin-ui";
import { addBlacklist, deleteBlacklist, listBlacklist } from "@/lib/blacklist.functions";

export function AdminBlacklist() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listBlacklist);
  const add = useServerFn(addBlacklist);
  const remove = useServerFn(deleteBlacklist);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["sender-blacklist"],
    queryFn: () => fetchList(),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sender-blacklist"] });

  const addMut = useMutation({
    mutationFn: () => add({ data: { phone, note } }),
    onSuccess: () => {
      setPhone("");
      setNote("");
      toast.success("Nomor masuk Black List");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Nomor dikeluarkan dari Black List");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];

  return (
    <Panel
      title="Black List"
      description="Perangkat worker dengan nomor di daftar ini tidak akan mengirim pesan kampanye apa pun. Worker tidak diberi tahu."
    >
      <div className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addMut.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="bl-phone">Nomor HP</Label>
            <Input id="bl-phone" placeholder="628123456789" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bl-note">Alasan (opsional)</Label>
            <Input id="bl-note" placeholder="Mis. dicurigai" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={!phone.trim() || addMut.isPending}>
            Tambah
          </Button>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada nomor di Black List" />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Nomor</Th>
                <Th>Alasan</Th>
                <Th>Ditambahkan</Th>
                <Th>{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <Td className="font-mono">{r.phone}</Td>
                  <Td>{r.note ?? "—"}</Td>
                  <Td>{waktu(r.created_at)}</Td>
                  <Td className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Hapus"
                      disabled={delMut.isPending}
                      onClick={() => delMut.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>
    </Panel>
  );
}
