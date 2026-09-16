import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Users, MessageSquare, Gift } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { rupiah } from "@/lib/currency";
import { getMyReferral } from "@/lib/rewards.functions";

export const Route = createFileRoute("/_authenticated/referral")({
  head: () => ({
    meta: [
      { title: "Referal — WBlast" },
      {
        name: "description",
        content: "Undang anggota baru dan dapatkan bonus dari setiap pesan sukses tim Anda.",
      },
      { property: "og:title", content: "Referal — WBlast" },
      {
        property: "og:description",
        content: "Bagikan kode undangan dan pantau bonus dari tim referal Anda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralPage,
});

function ReferralPage() {
  const fetchReferral = useServerFn(getMyReferral);
  const { data } = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => fetchReferral(),
    refetchInterval: 30_000,
  });

  const fullLink =
    data?.code && typeof window !== "undefined"
      ? `${window.location.origin}/auth?ref=${data.code}`
      : (data?.link ?? "");

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} disalin`);
    } catch {
      toast.error("Gagal menyalin, salin manual ya");
    }
  };

  const rates = data
    ? [
        data.settings.referral_rate_l1,
        data.settings.referral_rate_l2,
        data.settings.referral_rate_l3,
      ].slice(0, Math.max(data.settings.referral_levels, 0))
    : [];

  return (
    <>
      <PageHeader
        title="Referal"
        description="Undang orang lain menjadi blaster dan dapatkan bonus otomatis dari setiap pesan sukses mereka."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Kode undangan Anda</CardTitle>
            <CardDescription>
              {rates.length
                ? rates
                    .map((r, i) => `Tingkat ${i + 1}: ${rupiah(r)} per pesan sukses`)
                    .join(" · ")
                : "Program referal sedang tidak aktif."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border bg-accent/40 p-4">
              <p className="text-xs uppercase text-muted-foreground">Kode referal</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-2xl font-semibold tracking-widest">{data?.code ?? "······"}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Salin kode"
                  onClick={() => data?.code && copy(data.code, "Kode referal")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase text-muted-foreground">Tautan cepat</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm">{fullLink || "—"}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Salin tautan"
                  onClick={() => fullLink && copy(fullLink, "Tautan referal")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-3">
          {[
            { icon: Users, label: "Total tim", value: `${data?.total_team ?? 0} orang` },
            {
              icon: MessageSquare,
              label: "Pesan sukses tim",
              value: String(data?.team_messages ?? 0),
            },
            { icon: Gift, label: "Total bonus", value: rupiah(data?.total_bonus) },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Riwayat undangan</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {(data?.team ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada anggota tim referal.
            </p>
          ) : (
            data!.team.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email_masked} · bergabung {new Date(m.joined_at).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <Badge variant="outline">Tingkat {m.level}</Badge>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {m.messages_sent} pesan
                </span>
                <span className="w-28 text-right text-sm font-medium text-primary">
                  {rupiah(m.bonus)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
