export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          batch_limit: number
          created_at: string
          group_id: string | null
          id: string
          max_delay: number
          media_url: string | null
          min_delay: number
          name: string
          scheduled_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          total_targets: number
          user_id: string
        }
        Insert: {
          batch_limit?: number
          created_at?: string
          group_id?: string | null
          id?: string
          max_delay?: number
          media_url?: string | null
          min_delay?: number
          name: string
          scheduled_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          total_targets?: number
          user_id: string
        }
        Update: {
          batch_limit?: number
          created_at?: string
          group_id?: string | null
          id?: string
          max_delay?: number
          media_url?: string | null
          min_delay?: number
          name?: string
          scheduled_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          total_targets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "wa_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          metadata_json: Json
          name: string
          phone: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          metadata_json?: Json
          name: string
          phone: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          metadata_json?: Json
          name?: string
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          error_log: string | null
          id: string
          message_body: string
          recipient_phone: string
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          user_id: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          error_log?: string | null
          id?: string
          message_body: string
          recipient_phone: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          user_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          error_log?: string | null
          id?: string
          message_body?: string
          recipient_phone?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          organization_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_name?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          content: string
          created_at: string
          has_media: boolean
          id: string
          media_url: string | null
          name: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          has_media?: boolean
          id?: string
          media_url?: string | null
          name: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          has_media?: boolean
          id?: string
          media_url?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_sessions: {
        Row: {
          auth_keys_json: Json | null
          battery_level: number | null
          created_at: string
          id: string
          last_ping: string | null
          phone_number: string | null
          qr_string: string | null
          session_name: string
          status: Database["public"]["Enums"]["wa_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_keys_json?: Json | null
          battery_level?: number | null
          created_at?: string
          id?: string
          last_ping?: string | null
          phone_number?: string | null
          qr_string?: string | null
          session_name: string
          status?: Database["public"]["Enums"]["wa_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_keys_json?: Json | null
          battery_level?: number | null
          created_at?: string
          id?: string
          last_ping?: string | null
          phone_number?: string | null
          qr_string?: string | null
          session_name?: string
          status?: Database["public"]["Enums"]["wa_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_status: "draft" | "running" | "paused" | "completed" | "failed"
      queue_status: "pending" | "processing" | "sent" | "failed"
      wa_status: "connecting" | "connected" | "disconnected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      campaign_status: ["draft", "running", "paused", "completed", "failed"],
      queue_status: ["pending", "processing", "sent", "failed"],
      wa_status: ["connecting", "connected", "disconnected"],
    },
  },
} as const
