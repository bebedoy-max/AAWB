/**
 * Profil WhatsApp global: nama dan foto profil yang ditetapkan admin dan
 * dipakai seluruh Worker's. Pembacaan terbuka untuk semua akun yang masuk,
 * penyimpanan hanya untuk admin/super admin, dan penerapan ke perangkat
 * selalu memakai kepemilikan sesi dari token login (bukan dari browser).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WaProfileSettings {
  name: string | null;
  /** data URL (data:image/png;base64,...) atau null bila belum diatur. */
  photo: string | null;
  mimetype: string | null;
}

export interface ApplyProfileResult {
  applied: number;
  failed: number;
  skipped: number;
  details: { device: string; status: "applied" | "failed" | "skipped"; message?: string }[];
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 1_500_000; // ~1,5 MB gambar mentah

const MIGRATION_HINT =
  "Profil WhatsApp belum aktif. Jalankan db/migrations/019_wa_profile.sql di SQL Editor Supabase.";

function parseDataUrl(value: string): { mimetype: string; base64: string } {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) throw new Error("Format foto tidak dikenali. Unggah ulang file JPEG, PNG, atau WEBP.");
  const mimetype = match[1]!.toLowerCase();
  const base64 = match[2]!.replace(/\s+/g, "");
  if (!ALLOWED_MIME.includes(mimetype)) {
    throw new Error("Format foto harus JPEG, PNG, atau WEBP.");
  }
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_BYTES) throw new Error("Ukuran foto maksimal 1,5 MB.");
  if (bytes < 100) throw new Error("File foto tidak valid.");
  return { mimetype, base64 };
}

/** Baca profil global. Tersedia untuk semua akun yang sudah masuk. */
export const getWaProfileSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<WaProfileSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("wa_profile_name, wa_profile_photo")
      .eq("id", "global")
      .maybeSingle();
    if (error) return { name: null, photo: null, mimetype: null };
    const photo = typeof data?.wa_profile_photo === "string" ? data.wa_profile_photo : null;
    const mimetype = photo ? (/^data:([^;]+);/.exec(photo)?.[1] ?? null) : null;
    return {
      name: (data?.wa_profile_name as string | null) || null,
      photo,
      mimetype,
    };
  });

/** Simpan profil global. Hanya admin & super admin. */
export const saveWaProfileSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string | null; photo?: string | null; clearPhoto?: boolean }) => ({
    name: typeof input?.name === "string" ? input.name.trim().slice(0, 25) : null,
    photo: typeof input?.photo === "string" && input.photo ? input.photo : null,
    clearPhoto: input?.clearPhoto === true,
  }))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("@/lib/admin-guard.server");
    await assertAdminRole(context.userId);

    if (data.name && data.name.length < 2) {
      throw new Error("Nama profil minimal 2 karakter.");
    }

    const patch: Record<string, unknown> = {
      id: "global",
      wa_profile_name: data.name || null,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    if (data.clearPhoto) {
      patch["wa_profile_photo"] = null;
    } else if (data.photo) {
      parseDataUrl(data.photo); // validasi
      patch["wa_profile_photo"] = data.photo;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert(patch, { onConflict: "id" });
    if (error) {
      if (/wa_profile_/.test(error.message)) throw new Error(MIGRATION_HINT);
      throw new Error(error.message);
    }
    return { ok: true };
  });

/**
 * Terapkan nama & foto profil global ke seluruh perangkat WhatsApp milik
 * pemanggil yang sedang terhubung. Perangkat offline dilewati tanpa
 * menggagalkan proses.
 */
export const applyWaProfileToMyDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApplyProfileResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error: settingsError } = await (supabaseAdmin as any)
      .from("app_settings")
      .select("wa_profile_name, wa_profile_photo")
      .eq("id", "global")
      .maybeSingle();
    if (settingsError) throw new Error(MIGRATION_HINT);

    const profileName = (settings?.wa_profile_name as string | null) || null;
    const photoRaw = (settings?.wa_profile_photo as string | null) || null;
    if (!profileName && !photoRaw) {
      throw new Error("Admin belum menetapkan nama atau foto profil.");
    }
    const picture = photoRaw ? parseDataUrl(photoRaw) : null;

    // Kepemilikan perangkat ditentukan dari sesi login, bukan dari browser.
    const { data: sessions, error } = await (context.supabase as any)
      .from("wa_sessions")
      .select("id, status, phone_number")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const rows = (sessions ?? []) as { id: string; status: string; phone_number: string | null }[];
    if (rows.length === 0) throw new Error("Belum ada perangkat terdaftar pada akun Anda.");

    const { sessionStatus, setWaProfileName, setWaProfilePicture } = await import(
      "@/lib/wa-gateway.server"
    );

    const result: ApplyProfileResult = { applied: 0, failed: 0, skipped: 0, details: [] };

    for (const row of rows) {
      const label = row.phone_number ? `+${row.phone_number}` : row.id.slice(0, 8);
      let connected = row.status === "connected";
      try {
        const live = await sessionStatus(row.id);
        connected = live.status === "connected";
      } catch {
        connected = false;
      }
      if (!connected) {
        result.skipped += 1;
        result.details.push({ device: label, status: "skipped", message: "Perangkat offline" });
        continue;
      }
      try {
        if (profileName) await setWaProfileName(row.id, profileName);
        if (picture) {
          await setWaProfilePicture(row.id, {
            mimetype: picture.mimetype,
            filename: `profil.${picture.mimetype.split("/")[1] ?? "jpg"}`,
            data: picture.base64,
          });
        }
        result.applied += 1;
        result.details.push({ device: label, status: "applied" });
      } catch (err) {
        result.failed += 1;
        result.details.push({
          device: label,
          status: "failed",
          message: err instanceof Error ? err.message : "Gagal menerapkan profil",
        });
      }
    }

    return result;
  });
