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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      adoption_evaluations: {
        Row: {
          adoption_score: number
          agent_id: string
          agent_number: number
          confidence: number
          created_at: string
          engagement: boolean
          evidence: Json | null
          experiment_id: string
          exposure: boolean
          id: string
          message_seq_at: number
          model: string | null
          propagation_score: number
          reason_summary: string
        }
        Insert: {
          adoption_score: number
          agent_id: string
          agent_number: number
          confidence: number
          created_at?: string
          engagement: boolean
          evidence?: Json | null
          experiment_id: string
          exposure: boolean
          id?: string
          message_seq_at: number
          model?: string | null
          propagation_score: number
          reason_summary: string
        }
        Update: {
          adoption_score?: number
          agent_id?: string
          agent_number?: number
          confidence?: number
          created_at?: string
          engagement?: boolean
          evidence?: Json | null
          experiment_id?: string
          exposure?: boolean
          id?: string
          message_seq_at?: number
          model?: string | null
          propagation_score?: number
          reason_summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "adoption_evaluations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adoption_evaluations_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memories: {
        Row: {
          agent_id: string
          agent_number: number
          created_at: string
          experiment_id: string
          id: string
          memory: Json
          message_seq_at: number
          update_kind: string
          version: number
        }
        Insert: {
          agent_id: string
          agent_number: number
          created_at?: string
          experiment_id: string
          id?: string
          memory: Json
          message_seq_at?: number
          update_kind?: string
          version: number
        }
        Update: {
          agent_id?: string
          agent_number?: number
          created_at?: string
          experiment_id?: string
          id?: string
          memory?: Json
          message_seq_at?: number
          update_kind?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_memories_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memories_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompts: {
        Row: {
          agent_id: string
          base_prompt: string
          created_at: string
          experiment_id: string
          identity_prompt: string
          seed_prompt: string | null
          system_prompt: string
        }
        Insert: {
          agent_id: string
          base_prompt: string
          created_at?: string
          experiment_id: string
          identity_prompt: string
          seed_prompt?: string | null
          system_prompt: string
        }
        Update: {
          agent_id?: string
          base_prompt?: string
          created_at?: string
          experiment_id?: string
          identity_prompt?: string
          seed_prompt?: string | null
          system_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompts_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_turns: {
        Row: {
          agent_id: string
          agent_number: number
          context_from_seq: number | null
          context_to_seq: number | null
          created_at: string
          experiment_id: string
          id: string
          memory_updated: boolean
          message_id: string | null
          pass_reason: string | null
          position_summary: string | null
          scheduler_reasons: Json | null
          scheduler_score: number | null
          spoke: boolean
          trigger: string
        }
        Insert: {
          agent_id: string
          agent_number: number
          context_from_seq?: number | null
          context_to_seq?: number | null
          created_at?: string
          experiment_id: string
          id?: string
          memory_updated?: boolean
          message_id?: string | null
          pass_reason?: string | null
          position_summary?: string | null
          scheduler_reasons?: Json | null
          scheduler_score?: number | null
          spoke?: boolean
          trigger?: string
        }
        Update: {
          agent_id?: string
          agent_number?: number
          context_from_seq?: number | null
          context_to_seq?: number | null
          created_at?: string
          experiment_id?: string
          id?: string
          memory_updated?: boolean
          message_id?: string | null
          pass_reason?: string | null
          position_summary?: string | null
          scheduler_reasons?: Json | null
          scheduler_score?: number | null
          spoke?: boolean
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_turns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_turns_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_turns_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          archetype: string
          code: string
          context_cleared_at: string | null
          context_epoch: number
          created_at: string
          current_position: string | null
          enabled: boolean
          experiment_id: string
          id: string
          is_seed: boolean
          last_error: string | null
          last_spoke_at: string | null
          last_turn_at: string | null
          memory_enabled: boolean
          message_count: number
          name: string
          number: number
          pass_count: number
          short_description: string
          status: string
          traits: Json
          turn_count: number
          updated_at: string
        }
        Insert: {
          archetype: string
          code: string
          context_cleared_at?: string | null
          context_epoch?: number
          created_at?: string
          current_position?: string | null
          enabled?: boolean
          experiment_id: string
          id?: string
          is_seed?: boolean
          last_error?: string | null
          last_spoke_at?: string | null
          last_turn_at?: string | null
          memory_enabled?: boolean
          message_count?: number
          name: string
          number: number
          pass_count?: number
          short_description?: string
          status?: string
          traits?: Json
          turn_count?: number
          updated_at?: string
        }
        Update: {
          archetype?: string
          code?: string
          context_cleared_at?: string | null
          context_epoch?: number
          created_at?: string
          current_position?: string | null
          enabled?: boolean
          experiment_id?: string
          id?: string
          is_seed?: boolean
          last_error?: string | null
          last_spoke_at?: string | null
          last_turn_at?: string | null
          memory_enabled?: boolean
          message_count?: number
          name?: string
          number?: number
          pass_count?: number
          short_description?: string
          status?: string
          traits?: Json
          turn_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      belief_states: {
        Row: {
          adoption_score: number
          agent_id: string
          agent_number: number
          confidence: number
          engaged: boolean
          engaged_at: string | null
          experiment_id: string
          exposed: boolean
          exposed_at: string | null
          exposed_message_seq: number | null
          id: string
          last_evaluated_message_seq: number
          last_evaluation_id: string | null
          peak_adoption_score: number
          propagation_score: number
          reason_summary: string | null
          stage: string
          stage_changed_at: string | null
          updated_at: string
        }
        Insert: {
          adoption_score?: number
          agent_id: string
          agent_number: number
          confidence?: number
          engaged?: boolean
          engaged_at?: string | null
          experiment_id: string
          exposed?: boolean
          exposed_at?: string | null
          exposed_message_seq?: number | null
          id?: string
          last_evaluated_message_seq?: number
          last_evaluation_id?: string | null
          peak_adoption_score?: number
          propagation_score?: number
          reason_summary?: string | null
          stage?: string
          stage_changed_at?: string | null
          updated_at?: string
        }
        Update: {
          adoption_score?: number
          agent_id?: string
          agent_number?: number
          confidence?: number
          engaged?: boolean
          engaged_at?: string | null
          experiment_id?: string
          exposed?: boolean
          exposed_at?: string | null
          exposed_message_seq?: number | null
          id?: string
          last_evaluated_message_seq?: number
          last_evaluation_id?: string | null
          peak_adoption_score?: number
          propagation_score?: number
          reason_summary?: string | null
          stage?: string
          stage_changed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "belief_states_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belief_states_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belief_states_last_evaluation_id_fkey"
            columns: ["last_evaluation_id"]
            isOneToOne: false
            referencedRelation: "adoption_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_events: {
        Row: {
          agent_number: number | null
          created_at: string
          data: Json | null
          experiment_id: string
          id: string
          kind: string
          message: string
          message_seq_at: number
        }
        Insert: {
          agent_number?: number | null
          created_at?: string
          data?: Json | null
          experiment_id: string
          id?: string
          kind: string
          message: string
          message_seq_at?: number
        }
        Update: {
          agent_number?: number | null
          created_at?: string
          data?: Json | null
          experiment_id?: string
          id?: string
          kind?: string
          message?: string
          message_seq_at?: number
        }
        Relationships: [
          {
            foreignKeyName: "experiment_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          config: Json
          created_at: string
          current_topic: string | null
          end_reason: string | null
          ended_at: string | null
          final_stats: Json | null
          id: string
          last_agent_message_at: string | null
          last_judge_seq: number
          last_tag_seq: number
          last_topic_seq: number
          message_count: number
          number: number
          paused_at: string | null
          phase: string
          resumed_at: string | null
          running_seconds: number
          seed_agent_number: number | null
          seed_belief: string
          seed_label: string
          started_at: string | null
          status: string
          title: string
          topic_index: number
          total_completion_tokens: number
          total_cost_usd: number
          total_llm_calls: number
          total_prompt_tokens: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          current_topic?: string | null
          end_reason?: string | null
          ended_at?: string | null
          final_stats?: Json | null
          id?: string
          last_agent_message_at?: string | null
          last_judge_seq?: number
          last_tag_seq?: number
          last_topic_seq?: number
          message_count?: number
          number?: number
          paused_at?: string | null
          phase?: string
          resumed_at?: string | null
          running_seconds?: number
          seed_agent_number?: number | null
          seed_belief: string
          seed_label?: string
          started_at?: string | null
          status?: string
          title?: string
          topic_index?: number
          total_completion_tokens?: number
          total_cost_usd?: number
          total_llm_calls?: number
          total_prompt_tokens?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          current_topic?: string | null
          end_reason?: string | null
          ended_at?: string | null
          final_stats?: Json | null
          id?: string
          last_agent_message_at?: string | null
          last_judge_seq?: number
          last_tag_seq?: number
          last_topic_seq?: number
          message_count?: number
          number?: number
          paused_at?: string | null
          phase?: string
          resumed_at?: string | null
          running_seconds?: number
          seed_agent_number?: number | null
          seed_belief?: string
          seed_label?: string
          started_at?: string | null
          status?: string
          title?: string
          topic_index?: number
          total_completion_tokens?: number
          total_cost_usd?: number
          total_llm_calls?: number
          total_prompt_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      influence_edges: {
        Row: {
          created_at: string
          evidence: string | null
          experiment_id: string
          id: string
          kind: string
          message_id: string | null
          source_agent_id: string
          source_agent_number: number
          target_agent_id: string
          target_agent_number: number
          weight: number
        }
        Insert: {
          created_at?: string
          evidence?: string | null
          experiment_id: string
          id?: string
          kind: string
          message_id?: string | null
          source_agent_id: string
          source_agent_number: number
          target_agent_id: string
          target_agent_number: number
          weight?: number
        }
        Update: {
          created_at?: string
          evidence?: string | null
          experiment_id?: string
          id?: string
          kind?: string
          message_id?: string | null
          source_agent_id?: string
          source_agent_number?: number
          target_agent_id?: string
          target_agent_number?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "influence_edges_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influence_edges_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influence_edges_source_agent_id_fkey"
            columns: ["source_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influence_edges_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          agent_id: string | null
          cached_tokens: number
          completion_tokens: number
          cost_usd: number
          created_at: string
          error: string | null
          experiment_id: string | null
          id: string
          latency_ms: number
          model: string
          prompt_tokens: number
          provider: string
          purpose: string
          reasoning_tokens: number
          status: string
        }
        Insert: {
          agent_id?: string | null
          cached_tokens?: number
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          error?: string | null
          experiment_id?: string | null
          id?: string
          latency_ms?: number
          model: string
          prompt_tokens?: number
          provider?: string
          purpose: string
          reasoning_tokens?: number
          status?: string
        }
        Update: {
          agent_id?: string | null
          cached_tokens?: number
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          error?: string | null
          experiment_id?: string | null
          id?: string
          latency_ms?: number
          model?: string
          prompt_tokens?: number
          provider?: string
          purpose?: string
          reasoning_tokens?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          addressed_agent_numbers: number[]
          agent_code: string | null
          agent_id: string | null
          agent_name: string | null
          agent_number: number | null
          completion_tokens: number | null
          content: string
          context_epoch: number
          cost_usd: number | null
          created_at: string
          experiment_id: string
          id: string
          kind: string
          latency_ms: number | null
          model: string | null
          prompt_tokens: number | null
          referenced_agent_numbers: number[]
          reply_to_message_id: string | null
          seed_relevance: number | null
          seed_stance: number | null
          seq: number
          topics: string[]
          viral_themes: string[]
        }
        Insert: {
          addressed_agent_numbers?: number[]
          agent_code?: string | null
          agent_id?: string | null
          agent_name?: string | null
          agent_number?: number | null
          completion_tokens?: number | null
          content: string
          context_epoch?: number
          cost_usd?: number | null
          created_at?: string
          experiment_id: string
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          referenced_agent_numbers?: number[]
          reply_to_message_id?: string | null
          seed_relevance?: number | null
          seed_stance?: number | null
          seq: number
          topics?: string[]
          viral_themes?: string[]
        }
        Update: {
          addressed_agent_numbers?: number[]
          agent_code?: string | null
          agent_id?: string | null
          agent_name?: string | null
          agent_number?: number | null
          completion_tokens?: number | null
          content?: string
          context_epoch?: number
          cost_usd?: number | null
          created_at?: string
          experiment_id?: string
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          referenced_agent_numbers?: number[]
          reply_to_message_id?: string | null
          seed_relevance?: number | null
          seed_stance?: number | null
          seq?: number
          topics?: string[]
          viral_themes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_leases: {
        Row: {
          expires_at: string
          holder: string
          key: string
          updated_at: string
        }
        Insert: {
          expires_at: string
          holder: string
          key: string
          updated_at?: string
        }
        Update: {
          expires_at?: string
          holder?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_runner_lease: {
        Args: { p_holder: string; p_key: string; p_ttl_seconds: number }
        Returns: boolean
      }
      add_experiment_usage: {
        Args: {
          p_completion: number
          p_cost: number
          p_experiment_id: string
          p_prompt: number
        }
        Returns: undefined
      }
      next_message_seq: { Args: { p_experiment_id: string }; Returns: number }
      release_runner_lease: {
        Args: { p_holder: string; p_key: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
