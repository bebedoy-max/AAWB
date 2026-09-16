/** Shared domain types for the WhatsApp broadcast platform. */

export type WaSessionStatus = "connecting" | "connected" | "disconnected";
export type CampaignStatus = "draft" | "running" | "paused" | "completed" | "failed";
export type QueueStatus = "pending" | "processing" | "sent" | "failed";

export interface Profile {
  id: string;
  user_id: string;
  organization_name: string;
  created_at: string;
}

export interface WaSession {
  id: string;
  user_id: string;
  session_name: string;
  phone_number: string | null;
  status: WaSessionStatus;
  qr_string: string | null;
  battery_level: number | null;
  last_ping: string | null;
  updated_at: string;
  created_at: string;
}

export interface ContactGroup {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  phone: string;
  metadata_json: Record<string, string>;
  created_at: string;
}

export type MediaType = "text" | "image" | "document" | "video" | "audio";

/** A tappable button that opens a URL when the recipient clicks it. */
export interface TemplateButton {
  text: string;
  url: string;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  content: string;
  has_media: boolean;
  media_url: string | null;
  media_type: MediaType;
  media_filename: string | null;
  footer_text: string | null;
  buttons_json: TemplateButton[];
  created_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  session_id: string | null;
  name: string;
  total_targets: number;
  status: CampaignStatus;
  min_delay: number;
  max_delay: number;
  batch_limit: number;
  scheduled_at: string | null;
  created_at: string;
}

export interface QueuedMessage {
  id: string;
  user_id: string;
  campaign_id: string;
  recipient_phone: string;
  message_body: string;
  status: QueueStatus;
  error_log: string | null;
  attempts: number;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
}

/** Payload accepted by POST /api/campaign/dispatch. */
export interface DispatchPayload {
  campaign_id: string;
  action: "enqueue" | "process" | "pause" | "resume" | "abort";
}

export interface DispatchResult {
  ok: boolean;
  queued?: number;
  processed?: number;
  sent?: number;
  failed?: number;
  status?: CampaignStatus;
  message?: string;
}

/** Payload sent to the WhatsApp gateway bridge (Baileys-compatible). */
export interface WhatsAppMessagePayload {
  session_id: string;
  to: string;
  type: MediaType;
  body: string;
  media_url?: string;
  media_filename?: string;
  footer_text?: string;
  buttons?: TemplateButton[];
}

export interface PairingCodeResponse {
  id: string;
  code: string;
  phone_number: string;
}

export interface SessionGatewayResponse {
  id: string;
  status: WaSessionStatus;
  qr_string: string | null;
  phone_number: string | null;
  battery_level: number | null;
  last_ping: string | null;
}
