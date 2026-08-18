import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toJson } from "@/lib/types";

export type EventKind =
  | "EXPERIMENT_CREATED"
  | "EXPERIMENT_STARTED"
  | "EXPERIMENT_PAUSED"
  | "EXPERIMENT_RESUMED"
  | "EXPERIMENT_STOPPED"
  | "EXPERIMENT_COMPLETED"
  | "EXPERIMENT_RESET"
  | "SEED_ACTIVE"
  | "TOPIC_INTRODUCED"
  | "FIRST_EXPOSURE"
  | "EXPOSURE"
  | "ENGAGEMENT"
  | "ADOPTION_CHANGE"
  | "PROPAGATION_CHANGE"
  | "PROPAGATION_BEGINS"
  | "STAGE_CHANGE"
  | "MEMORY_CONSOLIDATED"
  | "FINAL_MEMORY_WRITE"
  | "AGENT_ENABLED"
  | "AGENT_DISABLED"
  | "AGENT_CONTEXT_CLEARED"
  | "AGENT_MEMORY_CLEARED"
  | "MANUAL_TURN"
  | "AGENT_ERROR"
  | "BUDGET_REACHED"
  | "MESSAGE_LIMIT_REACHED"
  | "RUNNER_NOTE";

export async function logEvent(opts: {
  experimentId: string;
  kind: EventKind;
  message: string;
  agentNumber?: number | null;
  data?: Record<string, unknown> | null;
  messageSeqAt?: number;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("experiment_events").insert({
    experiment_id: opts.experimentId,
    kind: opts.kind,
    message: opts.message,
    agent_number: opts.agentNumber ?? null,
    data: opts.data ? toJson(opts.data) : null,
    message_seq_at: opts.messageSeqAt ?? 0,
  });
  if (error) console.error("logEvent failed", error.message);
}
