import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, countryByIso, type Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

export function CountrySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = countryByIso(value);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c: Country) =>
        c.name.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        c.dial.includes(q.replace(/\D/g, "")),
    );
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[130px] shrink-0 justify-between px-2 font-normal", className)}
        >
          <span className="truncate">
            {selected.flag} +{selected.dial}
          </span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <Input
          autoFocus
          placeholder="Cari negara atau kode"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-8"
        />
        <div className="max-h-64 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.iso}
              type="button"
              onClick={() => {
                onChange(c.iso);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span>{c.flag}</span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-muted-foreground">+{c.dial}</span>
              {c.iso === value ? <Check className="size-3.5" /> : null}
            </button>
          ))}
          {results.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Negara tidak ditemukan.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Country picker + national number field. */
export function PhoneInput({
  country,
  onCountryChange,
  value,
  onChange,
  placeholder = "812 3456 7890",
  id,
}: {
  country: string;
  onCountryChange: (iso: string) => void;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  return (
    <div className="flex gap-2">
      <CountrySelect value={country} onChange={onCountryChange} />
      <Input
        id={id}
        inputMode="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
