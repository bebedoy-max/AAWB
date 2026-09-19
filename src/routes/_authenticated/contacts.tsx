import { useMemo, useState } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, FolderPlus, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/my-client";
import { PageHeader } from "@/components/app-shell";
import { CsvImporter, type ParsedContact } from "@/components/csv-importer";
import { BulkPhoneImporter } from "@/components/bulk-phone-importer";
import { PhoneInput } from "@/components/phone-input";
import { countryByIso, DEFAULT_COUNTRY_ISO } from "@/lib/countries";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPhoneDisplay, sanitizePhone } from "@/lib/whatsapp";
import type { Contact, ContactGroup } from "@/types/wa";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Kontak & Grup — NAROWA" },
      { name: "description", content: "Kelola kontak dan grup penerima broadcast." },
      { property: "og:title", content: "Kontak & Grup — NAROWA" },
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
  const [formCountry, setFormCountry] = useState(DEFAULT_COUNTRY_ISO);
  const [groupForm, setGroupForm] = useState({ name: "", description: "" });
  const [editGroup, setEditGroup] = useState<ContactGroup | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: "", description: "" });
  const [viewGroup, setViewGroup] = useState<ContactGroup | null>(null);

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
      // The Data API caps a single response at 1000 rows, so page through all.
      const CHUNK = 1000;
      const all: Contact[] = [];
      for (let from = 0; ; from += CHUNK) {
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + CHUNK - 1);
        if (error) throw error;
        const rows = (data ?? []) as Contact[];
        all.push(...rows);
        if (rows.length < CHUNK) break;
      }
      return all;
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
      const phone = sanitizePhone(form.phone, countryByIso(formCountry).dial);
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
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase.from("contacts").insert(payload.slice(i, i + 500));
        if (error) throw error;
      }
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

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kontak berhasil dihapus");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groupName = (id: string | null) => groups?.find((g) => g.id === id)?.name;

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts ?? []) {
      if (c.group_id) counts[c.group_id] = (counts[c.group_id] ?? 0) + 1;
    }
    return counts;
  }, [contacts]);

  const renameGroup = useMutation({
    mutationFn: async () => {
      if (!editGroup) return;
      const { error } = await supabase
        .from("contact_groups")
        .update({ name: editGroupForm.name, description: editGroupForm.description || null })
        .eq("id", editGroup.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grup berhasil diperbarui");
      setEditGroup(null);
      queryClient.invalidateQueries({ queryKey: ["contact-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error: unlinkError } = await supabase
        .from("contacts")
        .update({ group_id: null })
        .eq("group_id", groupId);
      if (unlinkError) throw unlinkError;
      const { error } = await supabase.from("contact_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grup berhasil dihapus");
      if (groupFilter !== "all") setGroupFilter("all");
      queryClient.invalidateQueries({ queryKey: ["contact-groups"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
            <BulkPhoneImporter
              onImport={(rows) => importContacts.mutate(rows)}
              existingPhones={contacts?.map((c) => c.phone) ?? []}
            />
            <CsvImporter onImport={(rows) => importContacts.mutate(rows)} />
            <Button onClick={() => setContactOpen(true)}>
              <Plus className="mr-1 size-4" /> Tambah kontak
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="kontak">
        <TabsList>
          <TabsTrigger value="kontak">Kontak</TabsTrigger>
          <TabsTrigger value="grup">Grup</TabsTrigger>
        </TabsList>

        <TabsContent value="kontak">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 flex-1 sm:min-w-[200px]">
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
              <SelectTrigger className="w-full sm:w-48">
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
                <SelectTrigger className="h-8 w-full sm:w-44">
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
        </TabsContent>

        <TabsContent value="grup">
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {groups?.length ?? 0} grup
                </p>
                <Button variant="outline" size="sm" onClick={() => setGroupOpen(true)}>
                  <FolderPlus className="mr-1 size-4" /> Grup baru
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama grup</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Jumlah kontak</TableHead>
                      <TableHead className="w-24 text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(groups ?? []).map((g) => (
                      <TableRow
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => setViewGroup(g)}
                      >
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {g.description || <span className="text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            <Users className="mr-1 size-3" />
                            {groupCounts[g.id] ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditGroup(g);
                                setEditGroupForm({
                                  name: g.name,
                                  description: g.description ?? "",
                                });
                              }}
                            >
                              <Pencil className="size-3.5" />
                              <span className="sr-only">Ubah {g.name}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                const count = groupCounts[g.id] ?? 0;
                                if (
                                  window.confirm(
                                    count > 0
                                      ? `Hapus grup "${g.name}"? ${count} kontak di dalamnya tidak ikut terhapus, hanya dilepas dari grup ini.`
                                      : `Hapus grup "${g.name}"?`,
                                  )
                                ) {
                                  deleteGroup.mutate(g.id);
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                              <span className="sr-only">Hapus {g.name}</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(groups ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          Belum ada grup. Buat grup pertama untuk mengelompokkan kontak.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah kontak</DialogTitle>
            <DialogDescription>
              Pilih kode negara lalu masukkan nomornya — format internasional otomatis.
            </DialogDescription>
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
              <PhoneInput
                id="c-phone"
                country={formCountry}
                onCountryChange={setFormCountry}
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
              {form.phone ? (
                <p className="text-xs text-muted-foreground">
                  Akan disimpan sebagai{" "}
                  {sanitizePhone(form.phone, countryByIso(formCountry).dial) || "—"}
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

      <Dialog open={editGroup !== null} onOpenChange={(open) => !open && setEditGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah grup</DialogTitle>
            <DialogDescription>Perbarui nama atau deskripsi grup ini.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="eg-name">Nama grup</Label>
              <Input
                id="eg-name"
                value={editGroupForm.name}
                onChange={(e) => setEditGroupForm({ ...editGroupForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eg-desc">Deskripsi</Label>
              <Input
                id="eg-desc"
                value={editGroupForm.description}
                onChange={(e) =>
                  setEditGroupForm({ ...editGroupForm, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => renameGroup.mutate()}
              disabled={!editGroupForm.name || renameGroup.isPending}
            >
              Simpan perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewGroup !== null} onOpenChange={(open) => !open && setViewGroup(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kontak di grup {viewGroup?.name}</DialogTitle>
            <DialogDescription>
              {(contacts ?? []).filter((c) => c.group_id === viewGroup?.id).length} kontak dalam
              grup ini. Klik ikon tempat sampah untuk menghapus kontak.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Nomor telepon</TableHead>
                  <TableHead className="w-16 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contacts ?? [])
                  .filter((c) => c.group_id === viewGroup?.id)
                  .map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPhoneDisplay(c.phone)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm(`Hapus kontak "${c.name}"?`)) {
                              deleteContact.mutate(c.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Hapus {c.name}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {(contacts ?? []).filter((c) => c.group_id === viewGroup?.id).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Belum ada kontak di grup ini.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
