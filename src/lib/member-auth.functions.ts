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
  password: z.string().min(4, "Kata sandi minimal 4 karakter.").max(72),
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

export const checkUsername = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string }) => ({ username: usernameSchema.parse(input.username) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = usernameEmail(data.username);
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error("Username belum dapat diperiksa.");
    return { available: !(users.users ?? []).some((user) => user.email === email) };
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
 * Lupa kata sandi lewat Telegram.
 *
 * Worker mengisi username akun ATAU username Telegram-nya. Bila akun itu sudah
 * menyambungkan Telegram, kata sandi sementara dibuat dan dikirim oleh bot ke
 * akun Telegram tersebut. Jawaban selalu bersifat umum agar username tidak bisa
 * ditebak dari luar.
 */
export const requestPasswordResetViaTelegram = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => {
    const identifier = (input?.identifier ?? "").trim().replace(/^@/, "").toLowerCase();
    if (identifier.length < 3) throw new Error("Masukkan username akun atau username Telegram Anda.");
    return { identifier };
  })
  .handler(async ({ data }): Promise<{ ok: true; sent: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const admin = supabaseAdmin as any;

    let userId: string | null = null;

    // 1) Cocokkan sebagai username akun aplikasi.
    if (/^[a-z0-9_]{4,24}$/.test(data.identifier)) {
      const email = usernameEmail(data.identifier);
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = (users?.users ?? []).find((user) => user.email === email)?.id ?? null;
    }

    // 2) Bila belum ketemu, cocokkan sebagai username Telegram yang tersambung.
    if (!userId) {
      const { data: link } = await admin
        .from("telegram_links")
        .select("user_id")
        .ilike("username", data.identifier)
        .not("chat_id", "is", null)
        .maybeSingle();
      userId = link?.user_id ?? null;
    }

    if (!userId) return { ok: true, sent: false };

    const { data: link } = await admin
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!link?.chat_id) return { ok: true, sent: false };

    // Kata sandi sementara yang mudah dibaca.
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const temp = Array.from(
      { length: 10 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: memberPassword(temp),
    });
    if (error) throw new Error("Kata sandi sementara gagal dibuat. Coba lagi sebentar lagi.");

    const { sendTelegramMessage } = await import("@/lib/telegram.server");
    try {
      await sendTelegramMessage(
        link.chat_id,
        `🔐 <b>Permintaan lupa kata sandi</b>\nKata sandi sementara Anda: <code>${temp}</code>\n\nMasuk memakai kata sandi ini, lalu segera ganti di menu <b>Pengaturan Akun</b>.\nJika bukan Anda yang meminta, segera ganti kata sandi dan hubungi admin.`,
      );
    } catch {
      throw new Error("Notifikasi Telegram gagal dikirim. Hubungi admin.");
    }

    return { ok: true, sent: true };
  });
