import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type ExperimentRow = Tables["experiments"]["Row"];
export type AgentRow = Tables["agents"]["Row"];
export type AgentPromptRow = Tables["agent_prompts"]["Row"];
export type AgentMemoryRow = Tables["agent_memories"]["Row"];
export type MessageRow = Tables["messages"]["Row"];
export type AgentTurnRow = Tables["agent_turns"]["Row"];
export type BeliefStateRow = Tables["belief_states"]["Row"];
export type AdoptionEvaluationRow = Tables["adoption_evaluations"]["Row"];
export type InfluenceEdgeRow = Tables["influence_edges"]["Row"];
export type ExperimentEventRow = Tables["experiment_events"]["Row"];
export type LlmCallRow = Tables["llm_calls"]["Row"];
export type SiteSettingsRow = Tables["site_settings"]["Row"];

export type ExperimentStatus = ExperimentRow["status"];
export type AgentStatus = AgentRow["status"];

/** Ladder inferred from judge output. Never set by keyword matching. */
export type BeliefStage =
  | "unexposed"
  | "exposed"
  | "engaged"
  | "considering"
  | "partial"
  | "strong"
  | "propagating";

export const STAGE_ORDER: BeliefStage[] = [
  "unexposed",
  "exposed",
  "engaged",
  "considering",
  "partial",
  "strong",
  "propagating",
];

export const STAGE_LABEL: Record<BeliefStage, string> = {
  unexposed: "UNEXPOSED",
  exposed: "EXPOSED",
  engaged: "ENGAGED",
  considering: "CONSIDERING",
  partial: "PARTIAL ADOPTION",
  strong: "STRONG ADOPTION",
  propagating: "PROPAGATING",
};

/** Structured persistent memory (conceptual analogue of MEMORY.md). */
export interface AgentMemory {
  core_beliefs: string[];
  current_stances: { topic: string; stance: string }[];
  recent_belief_changes: { what: string; why: string; influenced_by?: string[] }[];
  important_arguments: { summary: string; from?: string; assessment?: string }[];
  agent_relationships: Record<string, { alignment: number; note: string }>;
  open_questions: string[];
  ideas_worth_preserving: string[];
  significant_events: string[];
  notes_to_future_self: string[];
  last_updated_seq: number;
}

export function emptyMemory(): AgentMemory {
  return {
    core_beliefs: [],
    current_stances: [],
    recent_belief_changes: [],
    important_arguments: [],
    agent_relationships: {},
    open_questions: [],
    ideas_worth_preserving: [],
    significant_events: [],
    notes_to_future_self: [],
    last_updated_seq: 0,
  };
}

/** Public trait profile (0..1). Used to build prompts; displayed in inspector. */
export interface TraitProfile {
  openness: number;
  skepticism: number;
  conformity: number;
  contrarianism: number;
  confidence: number;
  curiosity: number;
  sociability: number;
  persuasion_drive: number;
  susceptibility: number;
  evidence_threshold: number;
  philosophical_interest: number;
  belief_plasticity: number;
  advocacy_once_adopted: number;
  consensus_preference: number;
}

export interface SiteLinks {
  x_url: string | null;
  contract_address: string | null;
  contract_label: string | null;
}

export type Json = Database["public"]["Tables"]["experiments"]["Row"]["config"];
/** Cast arbitrary serialisable data to the Supabase Json type. */
export function toJson<T>(v: T): Json {
  return v as unknown as Json;
}
