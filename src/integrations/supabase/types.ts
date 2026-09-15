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
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          custom_domain: string | null
          status: string
          locale: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          custom_domain?: string | null
          status?: string
          locale?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          custom_domain?: string | null
          status?: string
          locale?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_branding: {
        Row: {
          org_id: string
          product_name: string
          logo_url: string | null
          logo_dark_url: string | null
          favicon_url: string | null
          primary_hsl: string
          primary_fg_hsl: string
          accent_hsl: string
          sidebar_hsl: string
          login_headline: string | null
          login_subheadline: string | null
          support_email: string | null
          updated_at: string
        }
        Insert: {
          org_id: string
          product_name?: string
          logo_url?: string | null
          logo_dark_url?: string | null
          favicon_url?: string | null
          primary_hsl?: string
          primary_fg_hsl?: string
          accent_hsl?: string
          sidebar_hsl?: string
          login_headline?: string | null
          login_subheadline?: string | null
          support_email?: string | null
          updated_at?: string
        }
        Update: {
          org_id?: string
          product_name?: string
          logo_url?: string | null
          logo_dark_url?: string | null
          favicon_url?: string | null
          primary_hsl?: string
          primary_fg_hsl?: string
          accent_hsl?: string
          sidebar_hsl?: string
          login_headline?: string | null
          login_subheadline?: string | null
          support_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      org_settings: {
        Row: {
          org_id: string
          argument_audiences: Json
          argument_context_fields: Json
          sharing_enabled: boolean
          share_default_ttl_days: number
          retention_days: number | null
          ai_provider: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          org_id: string
          argument_audiences?: Json
          argument_context_fields?: Json
          sharing_enabled?: boolean
          share_default_ttl_days?: number
          retention_days?: number | null
          ai_provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          argument_audiences?: Json
          argument_context_fields?: Json
          sharing_enabled?: boolean
          share_default_ttl_days?: number
          retention_days?: number | null
          ai_provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_types: {
        Row: {
          id: string
          org_id: string
          key: string
          label: string
          prompt_context: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          key: string
          label: string
          prompt_context?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          key?: string
          label?: string
          prompt_context?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      analysis_templates: {
        Row: {
          id: string
          org_id: string
          name: string
          is_default: boolean
          persona: string
          methodology_key: string
          methodology_label: string
          qualification_criteria: Json
          temperature_levels: Json
          frameworks: Json
          extra_instructions: string | null
          output_language: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          name: string
          is_default?: boolean
          persona?: string
          methodology_key?: string
          methodology_label?: string
          qualification_criteria?: Json
          temperature_levels?: Json
          frameworks?: Json
          extra_instructions?: string | null
          output_language?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          is_default?: boolean
          persona?: string
          methodology_key?: string
          methodology_label?: string
          qualification_criteria?: Json
          temperature_levels?: Json
          frameworks?: Json
          extra_instructions?: string | null
          output_language?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      pain_categories: {
        Row: {
          id: string
          org_id: string
          label: string
          icon: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          label: string
          icon?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          label?: string
          icon?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      pain_items: {
        Row: {
          id: string
          org_id: string
          category_id: string
          label: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          category_id: string
          label: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          category_id?: string
          label?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      offer_types: {
        Row: {
          id: string
          org_id: string
          key: string
          label: string
          instructions: string | null
          allows_item_selection: boolean
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          key: string
          label: string
          instructions?: string | null
          allows_item_selection?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          key?: string
          label?: string
          instructions?: string | null
          allows_item_selection?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          price_cents: number
          currency: string
          interval: string
          limits: Json
          features: Json
          is_active: boolean
          is_public: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          price_cents?: number
          currency?: string
          interval?: string
          limits?: Json
          features?: Json
          is_active?: boolean
          is_public?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string | null
          price_cents?: number
          currency?: string
          interval?: string
          limits?: Json
          features?: Json
          is_active?: boolean
          is_public?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          org_id: string
          plan_id: string
          status: string
          seats: number | null
          current_period_start: string
          current_period_end: string
          trial_ends_at: string | null
          cancel_at_period_end: boolean
          external_customer_id: string | null
          external_subscription_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          plan_id: string
          status?: string
          seats?: number | null
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          cancel_at_period_end?: boolean
          external_customer_id?: string | null
          external_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          plan_id?: string
          status?: string
          seats?: number | null
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          cancel_at_period_end?: boolean
          external_customer_id?: string | null
          external_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          org_id: string
          period_start: string
          metric: string
          total: number
          updated_at: string
        }
        Insert: {
          org_id: string
          period_start: string
          metric: string
          total?: number
          updated_at?: string
        }
        Update: {
          org_id?: string
          period_start?: string
          metric?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      organization_invites: {
        Row: {
          id: string
          org_id: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
          token: string
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          token?: string
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          org_id: string | null
          actor_user_id: string | null
          action: string
          entity: string | null
          entity_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          actor_user_id?: string | null
          action: string
          entity?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          actor_user_id?: string | null
          action?: string
          entity?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          user_id: string
          note: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          note?: string | null
          created_at?: string
        }
        Update: {
          user_id?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reserved_slugs: {
        Row: {
          slug: string
        }
        Insert: {
          slug: string
        }
        Update: {
          slug?: string
        }
        Relationships: []
      }
      analysis_results: {
        Row: {
          org_id: string
          bant_score: Json | null
          conversation_metrics: Json | null
          created_at: string
          id: string
          insights: Json | null
          meddic_score: Json | null
          meeting_id: string
          model_used: string | null
          overall_score: number | null
          rag_results: Json | null
          raw_analysis: Json | null
          sales_coach: Json | null
          spin_score: Json | null
          talk_ratio: Json | null
          temperature: string | null
        }
        Insert: {
          org_id?: string
          bant_score?: Json | null
          conversation_metrics?: Json | null
          created_at?: string
          id?: string
          insights?: Json | null
          meddic_score?: Json | null
          meeting_id: string
          model_used?: string | null
          overall_score?: number | null
          rag_results?: Json | null
          raw_analysis?: Json | null
          sales_coach?: Json | null
          spin_score?: Json | null
          talk_ratio?: Json | null
          temperature?: string | null
        }
        Update: {
          org_id?: string
          bant_score?: Json | null
          conversation_metrics?: Json | null
          created_at?: string
          id?: string
          insights?: Json | null
          meddic_score?: Json | null
          meeting_id?: string
          model_used?: string | null
          overall_score?: number | null
          rag_results?: Json | null
          raw_analysis?: Json | null
          sales_coach?: Json | null
          spin_score?: Json | null
          talk_ratio?: Json | null
          temperature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_results_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          provider: string | null
          quantity: number
          unit: string | null
          org_id: string
          created_at: string
          estimated_cost: number | null
          id: string
          input_tokens: number | null
          meeting_id: string | null
          model_used: string
          operation_type: string
          output_tokens: number | null
          user_id: string | null
        }
        Insert: {
          provider?: string | null
          quantity?: number
          unit?: string | null
          org_id?: string
          created_at?: string
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          meeting_id?: string | null
          model_used: string
          operation_type: string
          output_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          provider?: string | null
          quantity?: number
          unit?: string | null
          org_id?: string
          created_at?: string
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          meeting_id?: string | null
          model_used?: string
          operation_type?: string
          output_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          org_id: string
          created_at: string
          highlight_type: string
          id: string
          meeting_id: string
          speaker: string | null
          text: string
          timestamp_end: number | null
          timestamp_start: number | null
        }
        Insert: {
          org_id?: string
          created_at?: string
          highlight_type: string
          id?: string
          meeting_id: string
          speaker?: string | null
          text: string
          timestamp_end?: number | null
          timestamp_start?: number | null
        }
        Update: {
          org_id?: string
          created_at?: string
          highlight_type?: string
          id?: string
          meeting_id?: string
          speaker?: string | null
          text?: string
          timestamp_end?: number | null
          timestamp_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "highlights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          org_id: string
          category: string | null
          created_at: string
          doc_type: string
          extracted_content: string | null
          file_url: string | null
          id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          org_id?: string
          category?: string | null
          created_at?: string
          doc_type: string
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          org_id?: string
          category?: string | null
          created_at?: string
          doc_type?: string
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      knowledge_items: {
        Row: {
          org_id: string
          category: string | null
          created_at: string
          description: string | null
          id: string
          item_type: string
          metadata: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type: string
          metadata?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          metadata?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      live_tips: {
        Row: {
          org_id: string
          acao: string | null
          categoria: string
          emitted_at: string
          fonte_kb_id: string | null
          id: string
          meeting_id: string
          titulo: string
          urgencia: string
        }
        Insert: {
          org_id?: string
          acao?: string | null
          categoria: string
          emitted_at?: string
          fonte_kb_id?: string | null
          id?: string
          meeting_id: string
          titulo: string
          urgencia?: string
        }
        Update: {
          org_id?: string
          acao?: string | null
          categoria?: string
          emitted_at?: string
          fonte_kb_id?: string | null
          id?: string
          meeting_id?: string
          titulo?: string
          urgencia?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          share_enabled: boolean
          share_expires_at: string | null
          share_revoked_at: string | null
          shared_by: string | null
          org_id: string
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_type: string | null
          file_url: string | null
          id: string
          lead_company: string | null
          lead_email: string | null
          lead_name: string | null
          meeting_date: string | null
          meeting_type: string | null
          overall_score: number | null
          seller_id: string
          share_token: string | null
          status: string
          team_id: string | null
          temperature: string | null
          title: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          share_enabled?: boolean
          share_expires_at?: string | null
          share_revoked_at?: string | null
          shared_by?: string | null
          org_id?: string
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          lead_company?: string | null
          lead_email?: string | null
          lead_name?: string | null
          meeting_date?: string | null
          meeting_type?: string | null
          overall_score?: number | null
          seller_id: string
          share_token?: string | null
          status?: string
          team_id?: string | null
          temperature?: string | null
          title: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          share_enabled?: boolean
          share_expires_at?: string | null
          share_revoked_at?: string | null
          shared_by?: string | null
          org_id?: string
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          lead_company?: string | null
          lead_email?: string | null
          lead_name?: string | null
          meeting_date?: string | null
          meeting_type?: string | null
          overall_score?: number | null
          seller_id?: string
          share_token?: string | null
          status?: string
          team_id?: string | null
          temperature?: string | null
          title?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          org_id: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          org_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          org_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          org_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      transcription_segments: {
        Row: {
          org_id: string
          created_at: string
          end_ms: number | null
          id: string
          is_final: boolean
          meeting_id: string
          speaker: string | null
          start_ms: number | null
          text: string
        }
        Insert: {
          org_id?: string
          created_at?: string
          end_ms?: number | null
          id?: string
          is_final?: boolean
          meeting_id: string
          speaker?: string | null
          start_ms?: number | null
          text: string
        }
        Update: {
          org_id?: string
          created_at?: string
          end_ms?: number | null
          id?: string
          is_final?: boolean
          meeting_id?: string
          speaker?: string | null
          start_ms?: number | null
          text?: string
        }
        Relationships: []
      }
      transcriptions: {
        Row: {
          org_id: string
          created_at: string
          full_text: string
          id: string
          language: string | null
          meeting_id: string
          speakers: Json | null
        }
        Insert: {
          org_id?: string
          created_at?: string
          full_text: string
          id?: string
          language?: string | null
          meeting_id: string
          speakers?: Json | null
        }
        Update: {
          org_id?: string
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          meeting_id?: string
          speakers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "transcriptions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          org_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          org_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          org_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { _token: string; _user_id: string; _email: string }
        Returns: string
      }
      branding_for_host: { Args: { _slug: string | null; _domain?: string | null }; Returns: Json }
      check_org_quota: {
        Args: { _org_id: string; _metric: string; _requested?: number }
        Returns: boolean
      }
      current_org_id: { Args: Record<PropertyKey, never>; Returns: string }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      org_is_active: { Args: { _org_id: string }; Returns: boolean }
      org_quota_status: { Args: { _org_id: string }; Returns: Json }
      org_usage: { Args: { _org_id: string; _metric: string }; Returns: number }
      provision_organization: {
        Args: {
          _name: string
          _slug: string
          _plan_key?: string | null
          _product_name?: string | null
        }
        Returns: string
      }
      get_user_team_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gestor" | "vendedor"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "gestor", "vendedor"],
    },
  },
} as const
