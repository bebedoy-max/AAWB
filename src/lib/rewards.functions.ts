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

/** Satu rekening/e-wallet tujuan pencairan milik pengguna. */
export interface PayoutAccountRow {
  id: string;
  method: string;
  provider: string;
  number: string;
  name: string;
  is_default: boolean;
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
  accounts: PayoutAccountRow[];
  accounts_table_ready: boolean;
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

async function rolesOf(_supabase: any, userId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
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

/**
 * Ambil semua rekening pencairan milik pengguna. Kalau tabel payout_accounts
 * belum ada di database, kembalikan ready:false supaya UI jatuh ke mode lama.
 */
async function loadAccounts(
  admin: any,
  uid: string,
): Promise<{ rows: PayoutAccountRow[]; ready: boolean }> {
  const { data, error } = await admin
    .from("payout_accounts")
    .select("id,method,provider,number,name,is_default")
    .eq("user_id", uid)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], ready: false };
  return { rows: (data ?? []) as PayoutAccountRow[], ready: true };
}

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

    const { rows: accounts, ready: accounts_table_ready } = await loadAccounts(supabaseAdmin, uid);

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
      accounts,
      accounts_table_ready,
      ledger: (ledgerRes.data ?? []) as LedgerEntry[],
    };
  });

function validateAccount(input: {
  method?: string;
  provider?: string;
  number?: string;
  name?: string;
}) {
  const method = (input?.method ?? "").trim();
  const provider = (input?.provider ?? "").trim();
  const number = (input?.number ?? "").trim();
  const name = (input?.name ?? "").trim();
  if (!["bank", "ewallet"].includes(method)) throw new Error("Pilih metode bank atau e-wallet.");
  if (!provider) throw new Error("Nama bank atau e-wallet wajib diisi.");
  if (!/^[0-9+\-\s]{6,25}$/.test(number)) throw new Error("Nomor rekening/e-wallet tidak valid.");
  if (name.length < 2) throw new Error("Nama pemilik rekening wajib diisi.");
  return { method, provider, number, name };
}

/** Tambah rekening baru tanpa menghapus rekening yang sudah tersimpan. */
export const addPayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateAccount)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const existing = await loadAccounts(supabaseAdmin, uid);
    if (!existing.ready) {
      return {
        ok: false,
        error:
          "Tabel daftar rekening belum dibuat di database. Jalankan skrip SQL payout_accounts terlebih dahulu.",
      };
    }
    if (existing.rows.length >= 4) {
      return {
        ok: false,
        error: "Maksimal 4 rekening. Hapus salah satu rekening sebelum menambah yang baru.",
      };
    }
    const isFirst = existing.rows.length === 0;
    const { error } = await (supabaseAdmin as any).from("payout_accounts").insert({
      user_id: uid,
      method: data.method,
      provider: data.provider,
      number: data.number,
      name: data.name,
      is_default: isFirst,
    });
    if (error) {
      if ((error.code ?? "") === "23505") return { ok: false, error: "Rekening ini sudah ada." };
      return { ok: false, error: error.message };
    }
    if (isFirst) {
      await (supabaseAdmin as any).from("profiles").upsert(
        {
          user_id: uid,
          payout_method: data.method,
          payout_provider: data.provider,
          payout_number: data.number,
          payout_name: data.name,
        },
        { onConflict: "user_id" },
      );
    }
    return { ok: true };
  });

/** Jadikan satu rekening sebagai tujuan utama pencairan. */
export const setDefaultPayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Rekening tidak valid.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const { data: row, error: readErr } = await (supabaseAdmin as any)
      .from("payout_accounts")
      .select("id,method,provider,number,name")
      .eq("id", data.id)
      .eq("user_id", uid)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row) return { ok: false, error: "Rekening tidak ditemukan." };

    await (supabaseAdmin as any)
      .from("payout_accounts")
      .update({ is_default: false })
      .eq("user_id", uid);
    const { error } = await (supabaseAdmin as any)
      .from("payout_accounts")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", uid);
    if (error) return { ok: false, error: error.message };

    await (supabaseAdmin as any).from("profiles").upsert(
      {
        user_id: uid,
        payout_method: row.method,
        payout_provider: row.provider,
        payout_number: row.number,
        payout_name: row.name,
      },
      { onConflict: "user_id" },
    );
    return { ok: true };
  });

/** Hapus satu rekening dari daftar. */
export const deletePayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Rekening tidak valid.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const { error } = await (supabaseAdmin as any)
      .from("payout_accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", uid);
    if (error) return { ok: false, error: error.message };

    const { rows } = await loadAccounts(supabaseAdmin, uid);
    if (rows.length === 0) {
      await (supabaseAdmin as any).from("profiles").upsert(
        {
          user_id: uid,
          payout_method: null,
          payout_provider: null,
          payout_number: null,
          payout_name: null,
        },
        { onConflict: "user_id" },
      );
      return { ok: true };
    }
    if (!rows.some((r) => r.is_default)) {
      const first = rows[0]!;
      await (supabaseAdmin as any)
        .from("payout_accounts")
        .update({ is_default: true })
        .eq("id", first.id);
      await (supabaseAdmin as any).from("profiles").upsert(
        {
          user_id: uid,
          payout_method: first.method,
          payout_provider: first.provider,
          payout_number: first.number,
          payout_name: first.name,
        },
        { onConflict: "user_id" },
      );
    }
    return { ok: true };
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
  .inputValidator((input: { amount: number; account_id?: string }) => {
    const amount = Number(input?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Jumlah penarikan tidak valid.");
    return { amount, account_id: (input?.account_id ?? "").trim() || null };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await readSettings();
    const uid = context.userId;

    let target: { method: string; provider: string; number: string; name: string } | null = null;

    if (data.account_id) {
      const { data: acc } = await (supabaseAdmin as any)
        .from("payout_accounts")
        .select("method,provider,number,name")
        .eq("id", data.account_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (!acc) return { ok: false, error: "Rekening tujuan tidak ditemukan." };
      target = acc;
    } else {
      const { rows } = await loadAccounts(supabaseAdmin, uid);
      const pick = rows.find((r) => r.is_default) ?? rows[0];
      if (pick) {
        target = {
          method: pick.method,
          provider: pick.provider,
          number: pick.number,
          name: pick.name,
        };
      } else {
        const { data: profile } = await (supabaseAdmin as any)
          .from("profiles")
          .select("payout_method,payout_provider,payout_number,payout_name")
          .eq("user_id", uid)
          .maybeSingle();
        if (profile?.payout_number) {
          target = {
            method: profile.payout_method,
            provider: profile.payout_provider,
            number: profile.payout_number,
            name: profile.payout_name,
          };
        }
      }
    }

    if (!target) return { ok: false, error: "Lengkapi data rekening pencairan terlebih dahulu." };

    const { data: bal } = await (supabaseAdmin as any).rpc("reward_balance", { _user_id: uid });
    const balance = Number(bal ?? 0);
    if (data.amount < settings.min_withdrawal) {
      return {
        ok: false,
        error: `Minimum penarikan Rp ${settings.min_withdrawal.toLocaleString("id-ID")}.`,
      };
    }
    if (data.amount > balance) {
      return { ok: false, error: "Jumlah penarikan melebihi saldo tersedia." };
    }

    const { error } = await (supabaseAdmin as any).from("withdrawals").insert({
      user_id: uid,
      amount: data.amount,
      method: target.method,
      provider: target.provider,
      account_number: target.number,
      account_name: target.name,
      status: "pending",
    });
    if (error) return { ok: false, error: error.message };
    await (await import("@/lib/activity-log.server")).logActivity(uid, "withdrawal_request", `Pengajuan penarikan Rp ${data.amount.toLocaleString("id-ID")}`);
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
    const { data: row, error } = await (supabaseAdmin as any)
      .from("withdrawals")
      .update({
        status: data.status,
        note: data.note || null,
        processed_at: new Date().toISOString(),
        processed_by: context.userId,
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("user_id,amount,provider,method,account_name,account_number")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await (await import("@/lib/activity-log.server")).logActivity(
      context.userId,
      data.status === "approved" ? "withdrawal_approved" : "withdrawal_rejected",
      `Penarikan ${data.id}${data.note ? ` — ${data.note}` : ""}`,
    );
    if (row?.user_id) {
      const nominal = new Intl.NumberFormat("id-ID").format(Number(row.amount ?? 0));

      // Nama pemilik rekening disamarkan: hanya huruf pertama setiap kata.
      const maskName = (value: string | null): string =>
        (value ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => `${word[0]?.toUpperCase() ?? ""}${"•".repeat(Math.max(word.length - 1, 1))}`)
          .join(" ") || "—";
      // Nomor rekening disamarkan: hanya 4 digit terakhir.
      const maskNumber = (value: string | null): string => {
        const digits = (value ?? "").replace(/\s+/g, "");
        return digits ? `••••${digits.slice(-4)}` : "—";
      };

      // Nama member: username akun aplikasi, atau username Telegram bila ada.
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
      const fromEmail = (userData?.user?.email ?? "").split("@")[0] ?? "";
      const { data: tg } = await (supabaseAdmin as any)
        .from("telegram_links")
        .select("username")
        .eq("user_id", row.user_id)
        .maybeSingle();
      const member = fromEmail || tg?.username || "member";

      const bank = row.provider || row.method || "—";
      const detail =
        `👤 <b>Member:</b> @${member}\n` +
        `💵 <b>Nominal:</b> Rp ${nominal}\n` +
        `🏦 <b>Bank:</b> ${bank} a/n ${maskName(row.account_name)}\n` +
        `🔢 <b>Rekening:</b> ${maskNumber(row.account_number)}`;

      const { notifyUserTelegram } = await import("@/lib/telegram.server");
      await notifyUserTelegram(
        row.user_id,
        data.status === "approved"
          ? `🎉 <b>Withdrawal Berhasil!</b>\n${detail}\n✅ <b>Status:</b> Sukses ditransfer${data.note ? `\n📝 <b>Catatan:</b> ${data.note}` : ""}`
          : `⚠️ <b>Withdrawal Ditolak</b>\n${detail}\n❌ <b>Status:</b> Ditolak${data.note ? `\n📝 <b>Alasan:</b> ${data.note}` : ""}`,
      );
    }
    return { ok: true };
  });
