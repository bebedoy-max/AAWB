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