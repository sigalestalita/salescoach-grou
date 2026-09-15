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
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
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
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
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
          created_at: string
          full_text: string
          id: string
          language: string | null
          meeting_id: string
          speakers: Json | null
        }
        Insert: {
          created_at?: string
          full_text: string
          id?: string
          language?: string | null
          meeting_id: string
          speakers?: Json | null
        }
        Update: {
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
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
