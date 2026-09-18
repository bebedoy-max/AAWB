/**
 * Kerangka konsol admin. Semua halaman admin menjadi anak rute ini sehingga
 * pemeriksaan hak akses hanya ditulis sekali.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/admin.functions";
import { Panel } from "@/components/admin-ui";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Konsol Admin — AAWB" },
      {
        name: "description",
        content: "Kelola pengguna, kampanye, data nomor, laporan, dan sistem AAWB.",
      },
      { property: "og:title", content: "Konsol Admin — AAWB" },
      {
        property: "og:description",
        content: "Kelola pengguna, kampanye, data nomor, laporan, dan sistem AAWB.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminLayout,
});

/** Peran pengguna saat ini, dipakai banyak halaman admin. */
export function useMyRole() {
  const fetchRole = useServerFn(getMyRole);
  return useQuery({
    queryKey: ["my-role"],
    queryFn: () => fetchRole(),
    retry: false,
    staleTime: 60_000,
  });
}

function AdminLayout() {
  const { data, isLoading } = useMyRole();

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>;
  }

  if (!data?.is_admin) {
    return (
      <Panel>
        <div className="py-12 text-center">
          <p className="text-sm font-medium">Akses ditolak</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Halaman ini hanya untuk admin dan super admin.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Outlet />
    </div>
  );
}
