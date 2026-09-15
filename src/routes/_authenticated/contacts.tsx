import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { CsvImporter, type ParsedContact } from "@/components/csv-importer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhoneDisplay, sanitizePhone } from "@/lib/whatsapp";
import type { Contact, ContactGroup } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Kontak & Grup — WBlast" },
      { name: "description", content: "Kelola kontak dan grup penerima broadcast." },
      { property: "og:title", content: "Kontak & Grup — WBlast" },
      { property: "og:description", content: "Kelola kontak dan grup penerima broadcast." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contacts,
});

const PAGE_SIZE = 10;

function Contacts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", group_id: "none" });
  const [groupForm, setGroupForm] = useState({ name: "", description: "" });

  const { data: groups } = useQuery({
    queryKey: ["contact-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("contact_groups").select("*").order("name");
      return (data ?? []) as ContactGroup[];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Contact[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (contacts ?? []).filter((c) => {
      const matchesGroup = groupFilter === "all" || c.group_id === groupFilter;
      const matchesSearch =
        !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, ""));
      return matchesGroup && matchesSearch;
    });
  }, [contacts, search, groupFilter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const addContact = useMutation({
    mutationFn: async () => {
      const phone = sanitizePhone(form.phone);
      if (!phone) throw new Error("Masukkan nomor telepon yang valid");
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("contacts").insert({
        user_id: user.user!.id,
        name: form.name || phone,
        phone,
        group_id: form.group_id === "none" ? null : form.group_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kontak berhasil ditambahkan");
      setContactOpen(false);
      setForm({ name: "", phone: "", group_id: "none" });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addGroup = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("contact_groups").insert({
        user_id: user.user!.id,
        name: groupForm.name,
        description: groupForm.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grup berhasil dibuat");
      setGroupOpen(false);
      setGroupForm({ name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["contact-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importContacts = useMutation({
    mutationFn: async (rows: ParsedContact[]) => {
      const { data: user } = await supabase.auth.getUser();
      const payload = rows.map((r) => ({
        ...r,
        user_id: user.user!.id,
        group_id: groupFilter === "all" ? null : groupFilter,
      }));
      const { error } = await supabase.from("contacts").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} kontak berhasil diimpor`);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").delete().in("id", selected);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selected.length} kontak berhasil dihapus`);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const bulkAssign = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase
        .from("contacts")
        .update({ group_id: groupId === "none" ? null : groupId })
        .in("id", selected);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grup berhasil diperbarui");
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const groupName = (id: string | null) => groups?.find((g) => g.id === id)?.name;

  return (
    <>
      <PageHeader
        title="Kontak & Grup"
        description="Kelola penerima broadcast beserta tag dan atribut khususnya."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGroupOpen(true)}>
              <FolderPlus className="mr-1 size-4" /> Grup baru
            </Button>
            <CsvImporter onImport={(rows) => importContacts.mutate(rows)} />
            <Button onClick={() => setContactOpen(true)}>
              <Plus className="mr-1 size-4" /> Tambah kontak
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama atau nomor telepon"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Select
              value={groupFilter}
              onValueChange={(v) => {
                setGroupFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Semua grup" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua grup</SelectItem>
                {(groups ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2">
              <span className="px-1 text-sm">{selected.length} dipilih</span>
              <Select onValueChange={(v) => bulkAssign.mutate(v)}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Pindahkan ke grup" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa grup</SelectItem>
                  {(groups ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => bulkDelete.mutate()}
              >
                <Trash2 className="mr-1 size-3.5" /> Hapus
              </Button>
            </div>
          ) : null}

          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id))}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? pageRows.map((r) => r.id) : [])
                      }
                      aria-label="Pilih semua di halaman ini"
                    />
                  </TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Nomor telepon</TableHead>
                  <TableHead>Grup</TableHead>
                  <TableHead>Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={(checked) =>
                          setSelected((s) =>
                            checked ? [...s, c.id] : s.filter((id) => id !== c.id),
                          )
                        }
                        aria-label={`Pilih ${c.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPhoneDisplay(c.phone)}
                    </TableCell>
                    <TableCell>
                      {groupName(c.group_id) ? (
                        <Badge variant="secondary">{groupName(c.group_id)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.metadata_json?.["tags"] || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Kontak tidak ditemukan.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{filtered.length} kontak</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Sebelumnya
              </Button>
              <span>
                {page + 1} / {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah kontak</DialogTitle>
            <DialogDescription>Nomor otomatis diubah formatnya (08… menjadi 628…).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nama</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Nomor telepon</Label>
              <Input
                id="c-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="081234567890"
              />
              {form.phone ? (
                <p className="text-xs text-muted-foreground">
                  Akan disimpan sebagai {sanitizePhone(form.phone) || "—"}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Grup</Label>
              <Select
                value={form.group_id}
                onValueChange={(v) => setForm({ ...form, group_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa grup</SelectItem>
                  {(groups ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addContact.mutate()}>Simpan kontak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grup baru</DialogTitle>
            <DialogDescription>Kelompokkan kontak agar mudah ditargetkan dalam kampanye.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-name">Nama grup</Label>
              <Input
                id="g-name"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-desc">Deskripsi</Label>
              <Input
                id="g-desc"
                value={groupForm.description}
                onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => addGroup.mutate()} disabled={!groupForm.name}>
              Buat grup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
