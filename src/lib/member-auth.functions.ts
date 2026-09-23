import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4, "Username minimal 4 karakter.")
  .max(24, "Username maksimal 24 karakter.")
  .regex(/^[a-z0-9_]+$/, "Gunakan huruf kecil, angka, atau garis bawah.");

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").max(72),
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  referralCode: z.string().trim().toUpperCase().max(12).optional(),
});

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameEmail(username: string): string {
  return `${normalizeUsername(username)}@member.aawb.local`;
}

export function memberPassword(password: string): string {
  return `${password}::AAWB`;
}

/* ------------------------------------------------------------------------- */
/* Pembantu server. Semua impor server bersifat dinamis (dipakai di handler). */
/* ------------------------------------------------------------------------- */

const RESET_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const RESET_CODE_LENGTH = 8;
const RESET_TTL_MINUTES = 10;
const RESET_GENERIC_ERROR = "Kode salah atau sudah kedaluwarsa. Minta kode baru.";

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

/**
 * Mencari id akun dari email. Memakai fungsi database `find_user_id_by_email`
 * (satu query terindeks). Jalur lama (memindai 1000 pengguna pertama) hanya
 * cadangan selama fungsi itu belum terpasang.
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const { data, error } = await (supabaseAdmin as any).rpc("find_user_id_by_email", { _email: email });
  if (!error) return (data as string | null) ?? null;

  console.warn("[member-auth] find_user_id_by_email belum tersedia, memakai jalur lama:", error.message);
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (users?.users ?? []).find((user) => user.email === email)?.id ?? null;
}

/** Akun + chat Telegram tujuan untuk permintaan reset (username akun ATAU username Telegram). */
async function resolveResetTarget(
  identifier: string,
): Promise<{ userId: string; chatId: string | number } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const admin = supabaseAdmin as any;

  let userId: string | null = null;
  if (/^[a-z0-9_]{4,24}$/.test(identifier)) {
    userId = await findUserIdByEmail(usernameEmail(identifier));
  }
  if (!userId) {
    // Netralkan karakter wildcard LIKE (% dan _) supaya pencocokan tepat.
    const pattern = identifier.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: byTelegram } = await admin
      .from("telegram_links")
      .select("user_id")
      .ilike("username", pattern)
      .not("chat_id", "is", null)
      .maybeSingle();
    userId = byTelegram?.user_id ?? null;
  }
  if (!userId) return null;

  const { data: link } = await admin
    .from("telegram_links")
    .select("chat_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!link?.chat_id) return null;
  return { userId, chatId: link.chat_id };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Jalur tersembunyi: pemulihan kata sandi lewat email untuk admin / super admin. */
async function sendStaffRecoveryEmail(email: string): Promise<void> {
  if (email.endsWith("@member.aawb.local")) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = await findUserIdByEmail(email);
  if (!userId) return;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const { data: roles } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isStaff = (roles ?? []).some(
    (r: { role: string }) => r.role === "admin" || r.role === "super_admin",
  );
  if (!isStaff) return;

  const url = process.env["MY_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const apikey =
    process.env["MY_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  if (!url || !apikey) return;

  let origin = "";
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    origin = new URL(getRequest().url).origin;
  } catch {
    /* tanpa origin, pakai pengalihan bawaan Supabase */
  }
  const redirectTo = origin ? `${origin}/ganti-sandi` : "";

  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/auth/v1/recover${
        redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""
      }`,
      {
        method: "POST",
        headers: { apikey, Authorization: `Bearer ${apikey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );
    if (!res.ok) console.error(`[reset] recover ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error("[reset] pengiriman email gagal:", err instanceof Error ? err.message : err);
  }
}

async function hashResetCode(userId: string, code: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

/** Pembatasan per IP (perkiraan). Bila konteks permintaan tidak tersedia, tidak memblokir. */
async function ipRateLimited(scope: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp, rateLimited } = await import("@/lib/rate-limit.server");
    return rateLimited(`${scope}:${clientIp(getRequest())}`, limit, windowMs);
  } catch {
    return false;
  }
}

export const checkUsername = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string }) => ({ username: usernameSchema.parse(input.username) }))
  .handler(async ({ data }) => {
    try {
      const existing = await findUserIdByEmail(usernameEmail(data.username));
      return { available: !existing };
    } catch {
      throw new Error("Username belum dapat diperiksa.");
    }
  });

export const registerMember = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = usernameEmail(data.username);
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: memberPassword(data.password),
      email_confirm: true,
      user_metadata: {
        organization_name: data.name,
        username: data.username,
        referral_code: data.referralCode || null,
      },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message.toLowerCase().includes("already");
      return {
        ok: false as const,
        error: duplicate ? "Username sudah digunakan." : "Akun belum dapat dibuat. Silakan coba lagi.",
      };
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: created.user.id,
        organization_name: data.name,
      },
      { onConflict: "user_id" },
    );
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      const duplicate = profileError.code === "23505";
      return {
        ok: false as const,
        error: duplicate ? "Username sudah digunakan." : "Profil belum dapat dibuat.",
      };
    }

    return { ok: true as const, email };
  });
/**
 * Lupa kata sandi lewat Telegram, dua langkah.
 *
 * 1) requestPasswordResetViaTelegram: worker mengisi username akun ATAU username
 *    Telegram-nya. Bila akun itu punya Telegram tersambung, bot mengirim KODE
 *    sekali pakai (berlaku 10 menit). Kata sandi TIDAK diubah di langkah ini.
 * 2) confirmPasswordResetViaTelegram: kata sandi baru hanya diterapkan setelah
 *    kode yang benar dimasukkan.
 *
 * Jawaban langkah 1 selalu sama (akun ada atau tidak), dan pembatasan laju per
 * akun dijaga di database (maks. 3 kode per jam, jeda 60 detik, 5 percobaan).
 */
export const requestPasswordResetViaTelegram = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => {
    const identifier = normalizeIdentifier(input?.identifier);
    if (!/^[a-z0-9_]{3,32}$/.test(identifier) && !EMAIL_RE.test(identifier)) {
      throw new Error("Masukkan username akun atau username Telegram Anda.");
    }
    return { identifier };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (await ipRateLimited("reset-request", 10, 60 * 60 * 1000)) return { ok: true };

    if (EMAIL_RE.test(data.identifier)) {
      await sendStaffRecoveryEmail(data.identifier);
      return { ok: true };
    }

    const target = await resolveResetTarget(data.identifier);
    if (!target) return { ok: true };

    const { randomInt } = await import("node:crypto");
    const code = Array.from({ length: RESET_CODE_LENGTH }, () =>
      RESET_ALPHABET.charAt(randomInt(RESET_ALPHABET.length)),
    ).join("");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: outcome, error } = await (supabaseAdmin as any).rpc("create_reset_code", {
      _user_id: target.userId,
      _code_hash: await hashResetCode(target.userId, code),
      _ttl_minutes: RESET_TTL_MINUTES,
    });
    if (error) {
      console.error("[reset] create_reset_code gagal:", error.message);
      return { ok: true };
    }
    if (outcome !== "ok") return { ok: true }; // terlalu sering: diam-diam, jawaban tetap umum

    const { sendTelegramMessage } = await import("@/lib/telegram.server");
    try {
      await sendTelegramMessage(
        target.chatId,
        `🔐 <b>Kode reset kata sandi</b>\nKode Anda: <code>${code}</code>\n\nBerlaku ${RESET_TTL_MINUTES} menit. Masukkan kode ini di halaman Lupa kata sandi bersama kata sandi baru.\nJangan bagikan kode ini kepada siapa pun. Jika bukan Anda yang meminta, abaikan pesan ini; kata sandi Anda tidak berubah.`,
      );
    } catch (err) {
      console.error("[reset] pengiriman Telegram gagal:", err instanceof Error ? err.message : err);
    }
    return { ok: true };
  });

export const confirmPasswordResetViaTelegram = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string; code: string; newPassword: string }) => {
    const identifier = normalizeIdentifier(input?.identifier);
    const code = String(input?.code ?? "")
      .trim()
      .toLowerCase();
    const newPassword = String(input?.newPassword ?? "");
    if (!/^[a-z0-9_]{3,32}$/.test(identifier)) throw new Error(RESET_GENERIC_ERROR);
    if (!new RegExp(`^[${RESET_ALPHABET}]{${RESET_CODE_LENGTH}}$`).test(code)) {
      throw new Error("Kode harus 8 karakter (huruf dan angka) seperti yang dikirim bot.");
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      throw new Error("Kata sandi baru harus 8–72 karakter.");
    }
    return { identifier, code, newPassword };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (await ipRateLimited("reset-confirm", 20, 60 * 60 * 1000)) {
      throw new Error("Terlalu banyak percobaan. Coba lagi nanti.");
    }

    const target = await resolveResetTarget(data.identifier);
    if (!target) throw new Error(RESET_GENERIC_ERROR);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: outcome, error } = await (supabaseAdmin as any).rpc("verify_reset_code", {
      _user_id: target.userId,
      _code_hash: await hashResetCode(target.userId, data.code),
    });
    if (error || outcome !== "ok") throw new Error(RESET_GENERIC_ERROR);

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target.userId, {
      password: memberPassword(data.newPassword),
    });
    if (updateError) throw new Error("Kata sandi belum dapat diubah. Minta kode baru lalu coba lagi.");

    const { sendTelegramMessage } = await import("@/lib/telegram.server");
    try {
      await sendTelegramMessage(
        target.chatId,
        "🔐 <b>Kata sandi diubah</b>\nKata sandi akun Anda baru saja diubah lewat kode reset. Jika bukan Anda, segera hubungi admin.",
      );
    } catch {
      /* pemberitahuan pelengkap; kegagalannya tidak membatalkan perubahan */
    }
    return { ok: true };
  });
