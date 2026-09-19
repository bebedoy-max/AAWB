/**
 * Panel "ATUR PROFIL" untuk Worker's: menampilkan nama dan foto profil yang
 * ditetapkan admin, menyediakan unduh foto, salin nama, dan penerapan nyata
 * ke seluruh perangkat WhatsApp milik pengguna yang sedang terhubung.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Download, Pin, UserRound, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyWaProfileToMyDevices,
  getWaProfileSettings,
  type ApplyProfileResult,
} from "@/lib/wa-profile.functions";

const NOTICE_DISMISS_KEY = "aawb:wa-profile-notice-dismissed";

export function WaProfilePanel({ compact = false }: { compact?: boolean }) {
  const fetchProfile = useServerFn(getWaProfileSettings);
  const applyProfile = useServerFn(applyWaProfileToMyDevices);

  const { data: profile } = useQuery({
    queryKey: ["wa-profile-settings"],
    queryFn: () => fetchProfile(),
  });

  const profileName = profile?.name ?? null;
  const photo = profile?.photo ?? null;
  const extension = (profile?.mimetype ?? "image/png").split("/")[1] ?? "png";

  const [dismissed, setDismissed] = useState(false);

  // Tutup permanen per worker: jika admin mengubah nama/foto profil,
  // pemberitahuan muncul kembali secara otomatis.
  useEffect(() => {
    if (!profile) return;
    const stamp = `${profileName ?? ""}:${photo?.length ?? 0}`;
    try {
      setDismissed(window.localStorage.getItem(NOTICE_DISMISS_KEY) === stamp);
    } catch {
      setDismissed(false);
    }
  }, [profile, profileName, photo]);

  const dismissNotice = () => {
    setDismissed(true);
    try {
      const stamp = `${profileName ?? ""}:${photo?.length ?? 0}`;
      window.localStorage.setItem(NOTICE_DISMISS_KEY, stamp);
    } catch {
      // penyimpanan tidak tersedia: cukup tutup untuk sesi ini
    }
  };

  const copyProfileName = async () => {
    if (!profileName) {
      toast.error("Admin belum menetapkan nama profil.");
      return;
    }
    await navigator.clipboard.writeText(profileName);
    toast.success("Nama profil disalin");
  };

  const downloadPhoto = () => {
    if (!photo) {
      toast.error("Admin belum mengunggah foto profil.");
      return;
    }
    const link = document.createElement("a");
    link.href = photo;
    link.download = `foto-profil.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const apply = useMutation({
    mutationFn: () => applyProfile(),
    onSuccess: (result: ApplyProfileResult) => {
      const parts = [`${result.applied} perangkat berhasil`];
      if (result.failed) parts.push(`${result.failed} gagal`);
      if (result.skipped) parts.push(`${result.skipped} offline dilewati`);
      const message = parts.join(", ");
      if (result.applied > 0) toast.success(message);
      else toast.error(message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dismissed) return null;

  return (
    <section className="relative mb-6 rounded-2xl border border-warning-border bg-warning-surface p-5 shadow-panel sm:p-6">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Tutup pemberitahuan"
        className="absolute right-2 top-2 size-7 rounded-full text-warning-foreground/70 hover:text-foreground"
        onClick={dismissNotice}
      >
        <X className="size-4" />
      </Button>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-warning">PERHATIAN: ATUR PROFIL</h2>
          <p className="mt-1 text-sm text-foreground/85">
            Gunakan nama dan foto profil yang ditentukan sebelum mulai mengirim pesan.
          </p>
          <div className="mt-4 rounded-lg border border-warning-border bg-background/25 p-3 text-xs font-semibold leading-5 text-warning-foreground">
            <Pin className="mr-2 inline size-3.5 text-warning" />
            Jika mengerjakan data, simpan bukti aktivitas sesuai arahan admin.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-warning/70 bg-member-panel">
              {photo ? (
                <img src={photo} alt="Foto profil yang ditetapkan admin" className="size-full object-cover" />
              ) : (
                <UserRound className="size-5 text-foreground/70" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-warning-foreground/80">Nama profil wajib</p>
              <p className="truncate text-sm font-semibold text-foreground">
                {profileName ?? "Belum diatur admin"}
              </p>
            </div>
          </div>
          <div className={compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-3 flex flex-wrap items-center gap-3"}>
            <Button size="sm" onClick={downloadPhoto} disabled={!photo}>
              <Download className="mr-1.5 size-4" /> {compact ? "Unduh Foto" : "Unduh foto profil"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void copyProfileName()}>
              {compact ? "Salin Nama" : "Salin nama profil"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className={compact ? "col-span-2" : undefined}
              onClick={() => apply.mutate()}
              disabled={apply.isPending}
            >
              <Wand2 className="mr-1.5 size-4" />
              {apply.isPending ? "Menerapkan…" : "Terapkan ke semua perangkat"}
            </Button>
          </div>
          {apply.data ? (
            <ul className="mt-3 space-y-1 text-xs text-warning-foreground">
              {apply.data.details.map((item) => (
                <li key={item.device}>
                  {item.device}:{" "}
                  {item.status === "applied"
                    ? "profil terpasang"
                    : item.status === "skipped"
                      ? "offline, dilewati"
                      : `gagal — ${item.message ?? "kesalahan tidak diketahui"}`}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
