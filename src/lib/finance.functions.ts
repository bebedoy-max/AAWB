/**
 * Server functions untuk laporan keuangan admin: rekap pendapatan (reward
 * ledger), pencairan dana (withdrawals), tren harian, dan peringkat worker.
 * Dipakai untuk monitoring serta audit pembanding dengan pembayaran agen.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FinanceWorkerRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  earned: number;
  from_messages: number;
  from_referral: number;
  from_adjustment: number;
  messages: number;
  paid: number;
  pending: number;
  balance_all_time: number;
}

export interface FinanceDayRow {
  date: string;
  earned: number;
  messages: number;
  paid: number;
}

export interface FinanceReport {
  from: string;
  to: string;
  reward_per_message: number;
  summary: {
    earned: number;
    from_messages: number;
    from_referral: number;
    from_adjustment: number;
    messages: number;
    paid: number;
    pending: number;
    rejected: number;
    active_workers: number;
    expected_from_messages: number;
    variance: number;
  };
  all_time: {
    earned: number;
    paid: number;
    pending: number;
    outstanding: number;
  };
  series: FinanceDayRow[];
  workers: FinanceWorkerRow[];
}

type AppRole = "super_admin" | "admin" | "member";

async function assertAdmin(context: any): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Hanya admin yang dapat melihat laporan keuangan.");
  }
}

function dayKey(value: string): string {
  return String(value).slice(0, 10);
}

/** Rekap keuangan pada rentang tanggal tertentu (mingguan/bulanan/custom). */
export const getFinanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => ({
    from: String(input.from).slice(0, 10),
    to: String(input.to).slice(0, 10),
  }))
  .handler(async ({ data, context }): Promise<FinanceReport> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const startIso = new Date(`${data.from}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${data.to}T23:59:59.999Z`).toISOString();

    const [
      { data: users },
      { data: roleRows },
      { data: profileRows },
      { data: ledgerAll },
      { data: withdrawalsAll },
      { data: queue },
      { data: settingRows },
    ] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("user_roles").select("user_id,role"),
      admin.from("profiles").select("user_id,organization_name"),
      admin.from("reward_ledger").select("user_id,kind,amount,created_at").limit(200000),
      admin.from("withdrawals").select("user_id,amount,status,created_at,processed_at").limit(20000),
      admin
        .from("message_queue")
        .select("user_id,status,sent_at")
        .eq("status", "sent")
        .gte("sent_at", startIso)
        .lte("sent_at", endIso)
        .limit(200000),
      admin.from("app_settings").select("reward_per_message").eq("id", "global").maybeSingle(),
    ]);

    const rewardPerMessage = Number((settingRows as any)?.reward_per_message ?? 100) || 100;

    const roleMap = new Map<string, AppRole[]>();
    for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }
    const nameMap = new Map<string, string>();
    for (const p of (profileRows ?? []) as { user_id: string; organization_name: string | null }[]) {
      if (p.organization_name) nameMap.set(p.user_id, p.organization_name);
    }

    const rows = new Map<string, FinanceWorkerRow>();
    const ensure = (userId: string): FinanceWorkerRow => {
      let row = rows.get(userId);
      if (!row) {
        row = {
          user_id: userId,
          name: "—",
          email: "(tanpa email)",
          role: "member",
          earned: 0,
          from_messages: 0,
          from_referral: 0,
          from_adjustment: 0,
          messages: 0,
          paid: 0,
          pending: 0,
          balance_all_time: 0,
        };
        rows.set(userId, row);
      }
      return row;
    };

    for (const u of ((users?.users ?? []) as any[])) {
      const row = ensure(u.id);
      const roles = roleMap.get(u.id) ?? [];
      row.role = roles.includes("super_admin")
        ? "super_admin"
        : roles.includes("admin")
          ? "admin"
          : "member";
      row.email = u.email ?? "(tanpa email)";
      row.name =
        nameMap.get(u.id) ??
        ((u.user_metadata?.["organization_name"] ??
          u.user_metadata?.["full_name"] ??
          u.user_metadata?.["name"]) as string | undefined) ??
        (u.email ? (String(u.email).split("@")[0] ?? "—") : "—");
    }

    const series = new Map<string, FinanceDayRow>();
    const day = (key: string): FinanceDayRow => {
      let d = series.get(key);
      if (!d) {
        d = { date: key, earned: 0, messages: 0, paid: 0 };
        series.set(key, d);
      }
      return d;
    };

    let allEarned = 0;
    let allPaid = 0;
    let allPending = 0;

    for (const l of (ledgerAll ?? []) as any[]) {
      const amount = Number(l.amount ?? 0);
      allEarned += amount;
      const row = ensure(l.user_id);
      row.balance_all_time += amount;
      const ts = String(l.created_at ?? "");
      if (ts >= startIso && ts <= endIso) {
        row.earned += amount;
        if (l.kind === "referral") row.from_referral += amount;
        else if (l.kind === "adjustment") row.from_adjustment += amount;
        else row.from_messages += amount;
        day(dayKey(ts)).earned += amount;
      }
    }

    let paid = 0;
    let pending = 0;
    let rejected = 0;
    for (const w of (withdrawalsAll ?? []) as any[]) {
      const amount = Number(w.amount ?? 0);
      const row = ensure(w.user_id);
      if (w.status === "approved") {
        allPaid += amount;
        row.balance_all_time -= amount;
      }
      if (w.status === "pending") {
        allPending += amount;
        row.balance_all_time -= amount;
      }
      const ts = String(w.processed_at ?? w.created_at ?? "");
      if (ts >= startIso && ts <= endIso) {
        if (w.status === "approved") {
          paid += amount;
          row.paid += amount;
          day(dayKey(ts)).paid += amount;
        } else if (w.status === "pending") {
          pending += amount;
          row.pending += amount;
        } else if (w.status === "rejected") {
          rejected += amount;
        }
      }
    }

    let messages = 0;
    for (const q of (queue ?? []) as any[]) {
      messages += 1;
      ensure(q.user_id).messages += 1;
      if (q.sent_at) day(dayKey(String(q.sent_at))).messages += 1;
    }

    const workers = Array.from(rows.values())
      .filter((r) => r.earned !== 0 || r.messages > 0 || r.paid !== 0 || r.pending !== 0)
      .sort((a, b) => b.earned - a.earned || b.messages - a.messages);

    const earned = workers.reduce((s, r) => s + r.earned, 0);
    const expected = messages * rewardPerMessage;
    const fromMessages = workers.reduce((s, r) => s + r.from_messages, 0);

    return {
      from: data.from,
      to: data.to,
      reward_per_message: rewardPerMessage,
      summary: {
        earned,
        from_messages: fromMessages,
        from_referral: workers.reduce((s, r) => s + r.from_referral, 0),
        from_adjustment: workers.reduce((s, r) => s + r.from_adjustment, 0),
        messages,
        paid,
        pending,
        rejected,
        active_workers: workers.filter((r) => r.messages > 0 || r.earned > 0).length,
        expected_from_messages: expected,
        variance: fromMessages - expected,
      },
      all_time: {
        earned: allEarned,
        paid: allPaid,
        pending: allPending,
        outstanding: allEarned - allPaid - allPending,
      },
      series: Array.from(series.values()).sort((a, b) => a.date.localeCompare(b.date)),
      workers,
    };
  });
