import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  sent: "Terkirim",
  connected: "Terhubung",
  completed: "Selesai",
  running: "Berjalan",
  processing: "Diproses",
  connecting: "Menghubungkan",
  pending: "Tertunda",
  queued: "Dalam antrean",
  paused: "Dijeda",
  draft: "Draf",
  disconnected: "Terputus",
  failed: "Gagal",
};

const TONES: Record<string, string> = {
  sent: "border-primary/30 bg-primary/10 text-primary",
  connected: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-primary/30 bg-primary/10 text-primary",
  running: "border-info/30 bg-info/10 text-info",
  processing: "border-info/30 bg-info/10 text-info",
  connecting: "border-warning/40 bg-warning/15 text-warning",
  pending: "border-warning/40 bg-warning/15 text-warning",
  queued: "border-warning/40 bg-warning/15 text-warning",
  paused: "border-warning/40 bg-warning/15 text-warning",
  draft: "border-border bg-muted text-muted-foreground",
  disconnected: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", TONES[status] ?? TONES["draft"], className)}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
