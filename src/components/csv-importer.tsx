import { useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sanitizePhone } from "@/lib/whatsapp";

export interface ParsedContact {
  name: string;
  phone: string;
  metadata_json: Record<string, string>;
}

const TARGETS = [
  { key: "name", label: "Nama" },
  { key: "phone", label: "Nomor telepon" },
  { key: "tags", label: "Tag" },
  { key: "var1", label: "Variabel khusus 1" },
  { key: "var2", label: "Variabel khusus 2" },
  { key: "ignore", label: "Abaikan" },
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function CsvImporter({ onImport }: { onImport: (rows: ParsedContact[]) => void }) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast.error("File tersebut tidak memiliki baris data.");
      return;
    }
    const head = parsed[0]!;
    setHeaders(head);
    setRows(parsed.slice(1));
    const guess: Record<number, string> = {};
    head.forEach((h, i) => {
      const low = h.toLowerCase();
      if (low.includes("name") || low.includes("nama")) guess[i] = "name";
      else if (low.includes("phone") || low.includes("hp") || low.includes("wa")) guess[i] = "phone";
      else if (low.includes("tag") || low.includes("group")) guess[i] = "tags";
      else guess[i] = "ignore";
    });
    setMapping(guess);
    setOpen(true);
  };

  const confirm = () => {
    const phoneIdx = Object.entries(mapping).find(([, v]) => v === "phone")?.[0];
    if (phoneIdx === undefined) {
      toast.error("Petakan satu kolom ke Nomor telepon terlebih dahulu.");
      return;
    }
    const nameIdx = Object.entries(mapping).find(([, v]) => v === "name")?.[0];

    const parsed: ParsedContact[] = [];
    for (const row of rows) {
      const phone = sanitizePhone(row[Number(phoneIdx)] ?? "");
      if (!phone) continue;
      const metadata: Record<string, string> = {};
      Object.entries(mapping).forEach(([idx, target]) => {
        if (target === "tags" || target === "var1" || target === "var2") {
          metadata[target] = row[Number(idx)] ?? "";
        }
      });
      parsed.push({
        name: (nameIdx !== undefined ? row[Number(nameIdx)] : "") || phone,
        phone,
        metadata_json: metadata,
      });
    }
    if (!parsed.length) {
      toast.error("Tidak ditemukan nomor telepon yang valid.");
      return;
    }
    onImport(parsed);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" asChild>
        <label className="cursor-pointer">
          <Upload className="mr-1 size-4" /> Impor CSV
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Petakan kolom Anda
            </DialogTitle>
            <DialogDescription>
              {rows.length} baris terdeteksi. Nomor telepon otomatis diubah ke format internasional
              (08… menjadi 628…).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {headers.map((header, i) => (
              <div key={i} className="grid grid-cols-2 items-center gap-3">
                <div className="min-w-0">
                  <Label className="truncate text-sm">{header || `Kolom ${i + 1}`}</Label>
                  <p className="truncate text-xs text-muted-foreground">
                    {rows[0]?.[i] ?? ""}
                  </p>
                </div>
                <Select
                  value={mapping[i] ?? "ignore"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [i]: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGETS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={confirm}>Impor {rows.length} baris</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
