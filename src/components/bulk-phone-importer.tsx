import { useMemo, useState } from "react";
import { ClipboardList, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CountrySelect } from "@/components/phone-input";
import { countryByIso, DEFAULT_COUNTRY_ISO } from "@/lib/countries";
import { formatPhoneDisplay, parsePhoneList } from "@/lib/whatsapp";
import type { ParsedContact } from "@/components/csv-importer";

/**
 * Bulk entry for phone numbers: paste a list, or load a plain .txt file.
 * Accepts one number per line, or numbers separated by comma/semicolon,
 * and optional "Nama, nomor" pairs.
 */
export function BulkPhoneImporter({
  onImport,
  existingPhones = [],
}: {
  onImport: (rows: ParsedContact[]) => void;
  existingPhones?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY_ISO);

  const dial = countryByIso(countryIso).dial;
  const parsed = useMemo(() => parsePhoneList(text, dial), [text, dial]);

  const known = useMemo(() => new Set(existingPhones), [existingPhones]);
  const fresh = parsed.filter((p) => !known.has(p.phone));
  const duplicates = parsed.length - fresh.length;

  const loadFile = async (file: File) => {
    const content = await file.text();
    setText((prev) => (prev.trim() ? `${prev}\n${content}` : content));
    toast.success(`${file.name} dimuat`);
  };

  const confirm = () => {
    if (!fresh.length) {
      toast.error("Tidak ada nomor baru yang valid untuk diimpor.");
      return;
    }
    onImport(
      fresh.map((r) => ({ name: r.name, phone: r.phone, metadata_json: {} })),
    );
    setOpen(false);
    setText("");
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardList className="mr-1 size-4" /> Tempel / TXT
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Input nomor massal</DialogTitle>
            <DialogDescription>
              Tempel daftar nomor (satu per baris) atau muat file .txt. Bisa juga format
              &quot;Nama, nomor&quot;. Nomor lokal otomatis memakai kode negara yang dipilih.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm">Kode negara bawaan</Label>
              <CountrySelect value={countryIso} onChange={setCountryIso} />
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <FileText className="mr-1 size-3.5" /> Muat file .txt
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void loadFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>

            <Textarea
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"08123456789\n+60123456789\nBudi, 081234567890"}
              className="font-mono text-sm"
            />

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{fresh.length} nomor siap diimpor</Badge>
              {duplicates > 0 ? (
                <Badge variant="outline">{duplicates} sudah ada / duplikat</Badge>
              ) : null}
            </div>

            {fresh.length > 0 ? (
              <div className="max-h-40 overflow-y-auto rounded-lg border p-2 text-xs">
                {fresh.slice(0, 50).map((r) => (
                  <div key={r.phone} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate text-muted-foreground">{r.name}</span>
                    <span>{formatPhoneDisplay(r.phone)}</span>
                  </div>
                ))}
                {fresh.length > 50 ? (
                  <p className="pt-1 text-center text-muted-foreground">
                    dan {fresh.length - 50} nomor lainnya…
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={confirm} disabled={!fresh.length}>
              Impor {fresh.length} nomor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
