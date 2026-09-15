import { supabase } from "@/integrations/supabase/my-client";
import type { DispatchPayload, DispatchResult, SessionGatewayResponse } from "@/types/wa";

async function authFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

/** GET session status + QR from the gateway bridge. */
export const getSessionState = (id: string) =>
  authFetch<SessionGatewayResponse>(`/api/session/${id}`);

/** Start / reconnect / disconnect a WhatsApp session on the gateway bridge. */
export const sessionAction = (id: string, action: "start" | "reconnect" | "disconnect" | "pair") =>
  authFetch<SessionGatewayResponse>(`/api/session/${id}`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });

/** Enqueue / process / control a campaign. */
export const dispatchCampaign = (payload: DispatchPayload) =>
  authFetch<DispatchResult>("/api/campaign/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
