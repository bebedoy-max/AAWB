/**
 * Server functions untuk sistem reward per pesan terkirim, referal berjenjang,
 * dan penarikan saldo. Nilai reward/referal/minimum tarik diatur super admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RewardSettings {
  rewards_enabled: boolean;
  reward_per_message: number;
  min_withdrawal: number;
  referral_levels: number;
  referral_rate_l1: number;
  referral_rate_l2: number;
  referral_rate_l3: number;
}

export interface LedgerEntry {
  id: string;
  kind: "message" | "referral" | "adjustment";
  amount: number;
  level: number;
  note: string | null;
  created_at: string;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  method: string | null;
  provider: string | null;
  account_number: string | null;
  account_name: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  note: string | null;
  created_at: string;
  processed_at: string | null;
  email?: string;
  name?: string;
}

export interface PayoutAccount {
  method: string | null;
  provider: string | null;
  number: string | null;
  name: string | null;
}

export interface MyRewards {
  balance: number;
  total_earned: number;
  from_messages: number;
  from_referral: number;
  total_withdrawn: number;
  pending_withdrawal: number;
  messages_sent: number;
  settings: RewardSettings;
  payout: PayoutAccount;
  ledger: LedgerEntry[];
}

export interface TeamMember {
  user_id: string;
  name: string;
  email_masked: string;
  level: number;
  messages_sent: number;
  bonus: number;
  joined_at: string;
}

export interface MyReferral {
  code: string;
  link: string;
  settings: RewardSettings;
  total_team: number;
  total_bonus: number;
  team_messages: number;
  team: TeamMember[];
}

const DEFAULTS: RewardSettings = {
  rewards_enabled: true,
  reward_per_message: 100,
  min_withdrawal: 50000,
  referral_levels: 1,
  referral_rate_l1: 100,
  referral_rate_l2: 0,
  referral_rate_l3: 0,
};

async function rolesOf(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

async function assertAdmin(context: any, superOnly = false) {
  const roles = await rolesOf(context.supabase, context.userId);
  const ok = superOnly
    ? roles.includes("super_admin")
    : roles.includes("super_admin") || roles.includes("admin");
  if (!ok) throw new Error("Anda tidak memiliki hak akses untuk tindakan ini.");
}

async function readSettings(): Promise<RewardSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("app_settings")
    .select(
      "rewards_enabled,reward_per_message,min_withdrawal,referral_levels,referral_rate_l1,referral_rate_l2,referral_rate_l3",
    )
    .eq("id", "global")
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    rewards_enabled: data.rewards_enabled ?? DEFAULTS.rewards_enabled,
    reward_per_message: Number(data.reward_per_message ?? DEFAULTS.reward_per_message),
    min_withdrawal: Number(data.min_withdrawal ?? DEFAULTS.min_withdrawal),
    referral_levels: Number(data.referral_levels ?? DEFAULTS.referral_levels),
    referral_rate_l1: Number(data.referral_rate_l1 ?? DEFAULTS.referral_rate_l1),
    referral_rate_l2: Number(data.referral_rate_l2 ?? DEFAULTS.referral_rate_l2),
    referral_rate_l3: Number(data.referral_rate_l3 ?? DEFAULTS.referral_rate_l3),
  };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain || !user) return "—";
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

/** Pengaturan reward yang berlaku (dibaca semua pengguna login). */
export const getRewardSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<RewardSettings> => {
    try {
      return await readSettings();
    } catch {
      return DEFAULTS;
    }
  });

/** Simpan pengaturan reward & referal (super admin). */
export const saveRewardSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RewardSettings) => {
    const num = (v: unknown, label: string) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} harus berupa angka ≥ 0.`);
      return n;
    };
    const levels = Number(input.referral_levels);
    if (![0, 1, 2, 3].includes(levels)) throw new Error("Tingkat referal hanya 0 sampai 3.");
    return {
      rewards_enabled: Boolean(input.rewards_enabled),
      reward_per_message: num(input.reward_per_message, "Reward per pesan"),
      min_withdrawal: num(input.min_withdrawal, "Minimum penarikan"),
      referral_levels: levels,
      referral_rate_l1: num(input.referral_rate_l1, "Bonus referal tingkat 1"),
      referral_rate_l2: num(input.referral_rate_l2, "Bonus referal tingkat 2"),
      referral_rate_l3: num(input.referral_rate_l3, "Bonus referal tingkat 3"),
    } satisfies RewardSettings;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert({ id: "global", ...data, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Saldo, riwayat reward, dan data rekening pengguna yang sedang masuk. */
export const getMyRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyRewards> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const settings = await readSettings();

    const [ledgerRes, withdrawRes, profileRes, sentRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("reward_ledger")
        .select("id,kind,amount,level,note,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      (supabaseAdmin as any).from("withdrawals").select("amount,status").eq("user_id", uid),
      (supabaseAdmin as any)
        .from("profiles")
        .select("payout_method,payout_provider,payout_number,payout_name")
        .eq("user_id", uid)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("message_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "sent"),
    ]);

    const { data: totals } = await (supabaseAdmin as any)
      .from("reward_ledger")
      .select("kind,amount")
      .eq("user_id", uid);
    const rows = (totals ?? []) as { kind: string; amount: number }[];
    const from_messages = rows
      .filter((r) => r.kind === "message")
      .reduce((s, r) => s + Number(r.amount), 0);
    const from_referral = rows
      .filter((r) => r.kind === "referral")
      .reduce((s, r) => s + Number(r.amount), 0);
    const other = rows
      .filter((r) => r.kind !== "message" && r.kind !== "referral")
      .reduce((s, r) => s + Number(r.amount), 0);
    const total_earned = from_messages + from_referral + other;

    const wr = (withdrawRes.data ?? []) as { amount: number; status: string }[];
    const total_withdrawn = wr
      .filter((w) => w.status === "approved")
      .reduce((s, w) => s + Number(w.amount), 0);
    const pending_withdrawal = wr
      .filter((w) => w.status === "pending")
      .reduce((s, w) => s + Number(w.amount), 0);

    return {
      balance: total_earned - total_withdrawn - pending_withdrawal,
      total_earned,
      from_messages,
      from_referral,
      total_withdrawn,
      pending_withdrawal,
      messages_sent: sentRes.count ?? 0,
      settings,
      payout: {
        method: profileRes.data?.payout_method ?? null,
        provider: profileRes.data?.payout_provider ?? null,
        number: profileRes.data?.payout_number ?? null,
        name: profileRes.data?.payout_name ?? null,
      },
      ledger: (ledgerRes.data ?? []) as LedgerEntry[],
    };
  });

/** Simpan metode pencairan saldo pengguna. */
export const savePayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { method: string; provider: string; number: string; name: string }) => {
    const method = (input?.method ?? "").trim();
    const provider = (input?.provider ?? "").trim();
    const number = (input?.number ?? "").trim();
    const name = (input?.name ?? "").trim();
    if (!["bank", "ewallet"].includes(method)) throw new Error("Pilih metode bank atau e-wallet.");
    if (!provider) throw new Error("Nama bank atau e-wallet wajib diisi.");
    if (!/^[0-9+\-\s]{6,25}$/.test(number)) throw new Error("Nomor rekening/e-wallet tidak valid.");
    if (name.length < 2) throw new Error("Nama pemilik rekening wajib diisi.");
    return { method, provider, number, name };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("profiles").upsert(
      {
        user_id: context.userId,
        payout_method: data.method,
        payout_provider: data.provider,
        payout_number: data.number,
        payout_name: data.name,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Ajukan penarikan saldo; menunggu persetujuan admin. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amount: number }) => {
    const amount = Number(input?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Jumlah penarikan tidak valid.");
    return { amount };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await readSettings();
    const uid = context.userId;

    const { data: profile } = await (supabaseAdmin as any)
      .from("profiles")
      .select("payout_method,payout_provider,payout_number,payout_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (!profile?.payout_number) {
      throw new Error("Lengkapi data rekening pencairan terlebih dahulu.");
    }

    const { data: bal } = await (supabaseAdmin as any).rpc("reward_balance", { _user_id: uid });
    const balance = Number(bal ?? 0);
    if (data.amount < settings.min_withdrawal) {
      throw new Error(`Minimum penarikan Rp ${settings.min_withdrawal.toLocaleString("id-ID")}.`);
    }
    if (data.amount > balance) throw new Error("Jumlah penarikan melebihi saldo tersedia.");

    const { error } = await (supabaseAdmin as any).from("withdrawals").insert({
      user_id: uid,
      amount: data.amount,
      method: profile.payout_method,
      provider: profile.payout_provider,
      account_number: profile.payout_number,
      account_name: profile.payout_name,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Riwayat penarikan pengguna yang sedang masuk. */
export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WithdrawalRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("withdrawals")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []) as WithdrawalRow[];
  });

/** Data referal pengguna: kode, tautan, dan tim beserta bonusnya. */
export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyReferral> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const settings = await readSettings();

    let { data: me } = await (supabaseAdmin as any)
      .from("profiles")
      .select("referral_code")
      .eq("user_id", uid)
      .maybeSingle();
    if (!me?.referral_code) {
      await (supabaseAdmin as any)
        .from("profiles")
        .upsert({ user_id: uid }, { onConflict: "user_id" });
      const again = await (supabaseAdmin as any)
        .from("profiles")
        .select("referral_code")
        .eq("user_id", uid)
        .maybeSingle();
      me = again.data;
    }
    const code = me?.referral_code ?? "";

    // Kumpulkan downline sampai kedalaman yang diizinkan pengaturan.
    const depth = Math.min(Math.max(settings.referral_levels, 0), 3);
    const levels: { user_id: string; level: number; created_at: string; name: string }[] = [];
    let frontier = [uid];
    for (let lvl = 1; lvl <= depth && frontier.length; lvl += 1) {
      const { data } = await (supabaseAdmin as any)
        .from("profiles")
        .select("user_id,organization_name,created_at")
        .in("referred_by", frontier);
      const rows = (data ?? []) as {
        user_id: string;
        organization_name: string | null;
        created_at: string;
      }[];
      for (const r of rows) {
        levels.push({
          user_id: r.user_id,
          level: lvl,
          created_at: r.created_at,
          name: r.organization_name ?? "Anggota",
        });
      }
      frontier = rows.map((r) => r.user_id);
    }

    const ids = levels.map((l) => l.user_id);
    const bonusByUser = new Map<string, number>();
    const sentByUser = new Map<string, number>();
    if (ids.length) {
      const { data: bonusRows } = await (supabaseAdmin as any)
        .from("reward_ledger")
        .select("amount,source_user_id")
        .eq("user_id", uid)
        .eq("kind", "referral");
      for (const b of (bonusRows ?? []) as { amount: number; source_user_id: string | null }[]) {
        if (!b.source_user_id) continue;
        bonusByUser.set(b.source_user_id, (bonusByUser.get(b.source_user_id) ?? 0) + Number(b.amount));
      }
      const { data: sentRows } = await (supabaseAdmin as any)
        .from("message_queue")
        .select("user_id")
        .in("user_id", ids)
        .eq("status", "sent");
      for (const s of (sentRows ?? []) as { user_id: string }[]) {
        sentByUser.set(s.user_id, (sentByUser.get(s.user_id) ?? 0) + 1);
      }
    }

    const emailById = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? "");
    }

    const team: TeamMember[] = levels.map((l) => ({
      user_id: l.user_id,
      name: l.name,
      email_masked: maskEmail(emailById.get(l.user_id) ?? ""),
      level: l.level,
      messages_sent: sentByUser.get(l.user_id) ?? 0,
      bonus: bonusByUser.get(l.user_id) ?? 0,
      joined_at: l.created_at,
    }));

    return {
      code,
      link: code ? `/auth?ref=${code}` : "",
      settings,
      total_team: team.length,
      total_bonus: team.reduce((s, t) => s + t.bonus, 0),
      team_messages: team.reduce((s, t) => s + t.messages_sent, 0),
      team: team.sort((a, b) => b.joined_at.localeCompare(a.joined_at)),
    };
  });

/** Kaitkan akun baru ke pengundangnya memakai kode referal. Sekali saja. */
export const attachReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const code = (input?.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error("Kode referal tidak valid.");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    const { data: mine } = await (supabaseAdmin as any)
      .from("profiles")
      .select("referred_by")
      .eq("user_id", uid)
      .maybeSingle();
    if (mine?.referred_by) return { ok: true, already: true };

    const { data: inviter } = await (supabaseAdmin as any)
      .from("profiles")
      .select("user_id")
      .eq("referral_code", data.code)
      .maybeSingle();
    if (!inviter?.user_id) throw new Error("Kode referal tidak ditemukan.");
    if (inviter.user_id === uid) throw new Error("Anda tidak dapat memakai kode sendiri.");

    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .upsert({ user_id: uid, referred_by: inviter.user_id }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true, already: false };
  });

/** Semua pengajuan penarikan (admin). */
export const adminListWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WithdrawalRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as WithdrawalRow[];
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const { data: profiles } = await (supabaseAdmin as any)
      .from("profiles")
      .select("user_id,organization_name");
    const nameById = new Map(
      ((profiles ?? []) as { user_id: string; organization_name: string | null }[]).map((p) => [
        p.user_id,
        p.organization_name ?? "—",
      ]),
    );
    return rows.map((r) => ({
      ...r,
      email: emailById.get(r.user_id) ?? "—",
      name: nameById.get(r.user_id) ?? "—",
    }));
  });

/** Setujui / tolak pengajuan penarikan (admin). */
export const setWithdrawalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "approved" | "rejected"; note?: string }) => {
    if (!input?.id) throw new Error("Pengajuan tidak valid.");
    if (!["approved", "rejected"].includes(input.status)) throw new Error("Status tidak valid.");
    return { id: input.id, status: input.status, note: (input.note ?? "").trim() };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("withdrawals")
      .update({
        status: data.status,
        note: data.note || null,
        processed_at: new Date().toISOString(),
        processed_by: context.userId,
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
