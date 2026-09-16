import { supabase } from "@/integrations/supabase/my-client";
import type {
  DispatchPayload,
  DispatchResult,
  PairingCodeResponse,
  SessionGatewayResponse,
} from "@/types/wa";

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
  // Server bisa membalas HTML (halaman error) saat gateway bermasalah,
  // jadi baca teks dulu lalu coba parse JSON.
  const text = await res.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = text ? (JSON.parse(text) as T & { error?: string }) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(
      json?.error ??
        (res.status === 502 || res.status === 503
          ? "Gateway WhatsApp tidak dapat dihubungi. Periksa alamat gateway di menu Admin."
          : `Permintaan gagal (${res.status})`),
    );
  }
  if (!json) throw new Error("Server memberi balasan yang tidak dikenali.");
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

/** Ask the gateway for an 8-character pairing code for this phone number. */
export const requestPairingCode = (id: string, phone: string) =>
  authFetch<PairingCodeResponse>(`/api/session/${id}`, {
    method: "POST",
    body: JSON.stringify({ action: "pair-code", phone }),
  });

/** Enqueue / process / control a campaign. */
export const dispatchCampaign = (payload: DispatchPayload) =>
  authFetch<DispatchResult>("/api/campaign/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
