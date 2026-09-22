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
      analysis_results: {
        Row: {
          bant_score: Json | null
          conversation_metrics: Json | null
          created_at: string
          id: string
          insights: Json | null
          meddic_score: Json | null
          meeting_id: string
          model_used: string | null
          org_id: string
          overall_score: number | null
          rag_results: Json | null
          raw_analysis: Json | null
          sales_coach: Json | null
          spin_score: Json | null
          talk_ratio: Json | null
          temperature: string | null
        }
        Insert: {
          bant_score?: Json | null
          conversation_metrics?: Json | null
          created_at?: string
          id?: string
          insights?: Json | null
          meddic_score?: Json | null
          meeting_id: string
          model_used?: string | null
          org_id: string
          overall_score?: number | null
          rag_results?: Json | null
          raw_analysis?: Json | null
          sales_coach?: Json | null
          spin_score?: Json | null
          talk_ratio?: Json | null
          temperature?: string | null
        }
        Update: {
          bant_score?: Json | null
          conversation_metrics?: Json | null
          created_at?: string
          id?: string
          insights?: Json | null
          meddic_score?: Json | null
          meeting_id?: string
          model_used?: string | null
          org_id?: string
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
          {
            foreignKeyName: "analysis_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_templates: {
        Row: {
          created_at: string
          extra_instructions: string | null
          frameworks: Json
          id: string
          is_default: boolean
          methodology_key: string
          methodology_label: string
          name: string
          org_id: string
          output_language: string
          persona: string
          qualification_criteria: Json
          temperature_levels: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra_instructions?: string | null
          frameworks?: Json
          id?: string
          is_default?: boolean
          methodology_key?: string
          methodology_label?: string
          name: string
          org_id: string
          output_language?: string
          persona?: string
          qualification_criteria?: Json
          temperature_levels?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra_instructions?: string | null
          frameworks?: Json
          id?: string
          is_default?: boolean
          methodology_key?: string
          methodology_label?: string
          name?: string
          org_id?: string
          output_language?: string
          persona?: string
          qualification_criteria?: Json
          temperature_levels?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          created_at: string
          estimated_cost: number | null
          id: string
          input_tokens: number | null
          meeting_id: string | null
          model_used: string
          operation_type: string
          org_id: string | null
          output_tokens: number | null
          provider: string | null
          quantity: number
          unit: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          meeting_id?: string | null
          model_used: string
          operation_type: string
          org_id?: string | null
          output_tokens?: number | null
          provider?: string | null
          quantity?: number
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          meeting_id?: string | null
          model_used?: string
          operation_type?: string
          org_id?: string | null
          output_tokens?: number | null
          provider?: string | null
          quantity?: number
          unit?: string | null
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
          {
            foreignKeyName: "api_usage_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          org_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          meta: Json | null
          org_id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          org_id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          org_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          created_at: string
          highlight_type: string
          id: string
          meeting_id: string
          org_id: string
          speaker: string | null
          text: string
          timestamp_end: number | null
          timestamp_start: number | null
        }
        Insert: {
          created_at?: string
          highlight_type: string
          id?: string
          meeting_id: string
          org_id: string
          speaker?: string | null
          text: string
          timestamp_end?: number | null
          timestamp_start?: number | null
        }
        Update: {
          created_at?: string
          highlight_type?: string
          id?: string
          meeting_id?: string
          org_id?: string
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
          {
            foreignKeyName: "highlights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          category: string | null
          created_at: string
          doc_type: string
          extracted_content: string | null
          file_url: string | null
          id: string
          org_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          doc_type: string
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          org_id?: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          doc_type?: string
          extracted_content?: string | null
          file_url?: string | null
          id?: string
          org_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          item_type: string
          metadata: Json | null
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type: string
          metadata?: Json | null
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          metadata?: Json | null
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      live_tips: {
        Row: {
          acao: string | null
          categoria: string
          emitted_at: string
          fonte_kb_id: string | null
          id: string
          meeting_id: string
          org_id: string
          titulo: string
          urgencia: string
        }
        Insert: {
          acao?: string | null
          categoria: string
          emitted_at?: string
          fonte_kb_id?: string | null
          id?: string
          meeting_id: string
          org_id: string
          titulo: string
          urgencia?: string
        }
        Update: {
          acao?: string | null
          categoria?: string
          emitted_at?: string
          fonte_kb_id?: string | null
          id?: string
          meeting_id?: string
          org_id?: string
          titulo?: string
          urgencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_tips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          org_id: string
          prompt_context: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          org_id: string
          prompt_context?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          org_id?: string
          prompt_context?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
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
          org_id: string
          overall_score: number | null
          seller_id: string
          share_enabled: boolean
          share_expires_at: string | null
          share_revoked_at: string | null
          share_token: string | null
          shared_by: string | null
          status: string
          team_id: string | null
          temperature: string | null
          title: string
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
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
          org_id?: string
          overall_score?: number | null
          seller_id: string
          share_enabled?: boolean
          share_expires_at?: string | null
          share_revoked_at?: string | null
          share_token?: string | null
          shared_by?: string | null
          status?: string
          team_id?: string | null
          temperature?: string | null
          title: string
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
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
          org_id?: string
          overall_score?: number | null
          seller_id?: string
          share_enabled?: boolean
          share_expires_at?: string | null
          share_revoked_at?: string | null
          share_token?: string | null
          shared_by?: string | null
          status?: string
          team_id?: string | null
          temperature?: string | null
          title?: string
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_types: {
        Row: {
          allows_item_selection: boolean
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          key: string
          label: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allows_item_selection?: boolean
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          key: string
          label: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allows_item_selection?: boolean
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          key?: string
          label?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          ai_provider: string | null
          argument_audiences: Json
          argument_context_fields: Json
          created_at: string
          org_id: string
          retention_days: number | null
          share_default_ttl_days: number
          sharing_enabled: boolean
          updated_at: string
        }
        Insert: {
          ai_provider?: string | null
          argument_audiences?: Json
          argument_context_fields?: Json
          created_at?: string
          org_id: string
          retention_days?: number | null
          share_default_ttl_days?: number
          sharing_enabled?: boolean
          updated_at?: string
        }
        Update: {
          ai_provider?: string | null
          argument_audiences?: Json
          argument_context_fields?: Json
          created_at?: string
          org_id?: string
          retention_days?: number | null
          share_default_ttl_days?: number
          sharing_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_branding: {
        Row: {
          accent_hsl: string
          favicon_url: string | null
          login_headline: string | null
          login_subheadline: string | null
          logo_dark_url: string | null
          logo_url: string | null
          org_id: string
          primary_fg_hsl: string
          primary_hsl: string
          product_name: string
          sidebar_hsl: string
          support_email: string | null
          updated_at: string
        }
        Insert: {
          accent_hsl?: string
          favicon_url?: string | null
          login_headline?: string | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          org_id: string
          primary_fg_hsl?: string
          primary_hsl?: string
          product_name?: string
          sidebar_hsl?: string
          support_email?: string | null
          updated_at?: string
        }
        Update: {
          accent_hsl?: string
          favicon_url?: string | null
          login_headline?: string | null
          login_subheadline?: string | null
          logo_dark_url?: string | null
          logo_url?: string | null
          org_id?: string
          primary_fg_hsl?: string
          primary_hsl?: string
          product_name?: string
          sidebar_hsl?: string
          support_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          custom_domain: string | null
          id: string
          locale: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          id?: string
          locale?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          id?: string
          locale?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pain_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          label: string
          org_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          label: string
          org_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          label?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pain_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pain_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          label: string
          org_id: string
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          label: string
          org_id: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pain_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pain_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pain_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          interval: string
          is_active: boolean
          is_public: boolean
          key: string
          limits: Json
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          is_public?: boolean
          key: string
          limits?: Json
          name: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          is_public?: boolean
          key?: string
          limits?: Json
          name?: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          org_id: string | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
      roleplay_messages: {
        Row: {
          audio_path: string | null
          content: string
          created_at: string
          id: string
          org_id: string
          role: string
          session_id: string
        }
        Insert: {
          audio_path?: string | null
          content: string
          created_at?: string
          id?: string
          org_id?: string
          role: string
          session_id: string
        }
        Update: {
          audio_path?: string | null
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roleplay_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "roleplay_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_sessions: {
        Row: {
          mode: string | null
          scenario: string | null
          created_at: string
          difficulty: string
          ended_at: string | null
          feedback: Json | null
          focus_pain: string | null
          id: string
          meeting_type: string | null
          org_id: string
          overall_score: number | null
          persona: Json
          status: string
          temperature: string | null
          turn_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: string
          ended_at?: string | null
          feedback?: Json | null
          focus_pain?: string | null
          id?: string
          meeting_type?: string | null
          org_id?: string
          overall_score?: number | null
          persona: Json
          status?: string
          temperature?: string | null
          turn_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: string
          ended_at?: string | null
          feedback?: Json | null
          focus_pain?: string | null
          id?: string
          meeting_type?: string | null
          org_id?: string
          overall_score?: number | null
          persona?: Json
          status?: string
          temperature?: string | null
          turn_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roleplay_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          org_id: string
          plan_id: string
          seats: number | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          org_id: string
          plan_id: string
          seats?: number | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          org_id?: string
          plan_id?: string
          seats?: number | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_segments: {
        Row: {
          created_at: string
          end_ms: number | null
          id: string
          is_final: boolean
          meeting_id: string
          org_id: string
          speaker: string | null
          start_ms: number | null
          text: string
        }
        Insert: {
          created_at?: string
          end_ms?: number | null
          id?: string
          is_final?: boolean
          meeting_id: string
          org_id: string
          speaker?: string | null
          start_ms?: number | null
          text: string
        }
        Update: {
          created_at?: string
          end_ms?: number | null
          id?: string
          is_final?: boolean
          meeting_id?: string
          org_id?: string
          speaker?: string | null
          start_ms?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transcriptions: {
        Row: {
          created_at: string
          full_text: string
          id: string
          language: string | null
          meeting_id: string
          org_id: string
          speakers: Json | null
        }
        Insert: {
          created_at?: string
          full_text: string
          id?: string
          language?: string | null
          meeting_id: string
          org_id: string
          speakers?: Json | null
        }
        Update: {
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          meeting_id?: string
          org_id?: string
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
          {
            foreignKeyName: "transcriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          metric: string
          org_id: string
          period_start: string
          total: number
          updated_at: string
        }
        Insert: {
          metric: string
          org_id: string
          period_start: string
          total?: number
          updated_at?: string
        }
        Update: {
          metric?: string
          org_id?: string
          period_start?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { _email: string; _token: string; _user_id: string }
        Returns: string
      }
      branding_for_host: {
        Args: { _domain?: string; _slug: string }
        Returns: Json
      }
      check_org_quota: {
        Args: { _metric: string; _org_id: string; _requested?: number }
        Returns: boolean
      }
      current_org_id: { Args: never; Returns: string }
      get_user_team_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      org_is_active: { Args: { _org_id: string }; Returns: boolean }
      org_quota_status: { Args: { _org_id: string }; Returns: Json }
      org_usage: { Args: { _metric: string; _org_id: string }; Returns: number }
      provision_organization: {
        Args: {
          _name: string
          _plan_key?: string
          _product_name?: string
          _slug: string
        }
        Returns: string
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
      app_role: ["admin", "gestor", "vendedor"],
    },
  },
} as const
