import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ExperimentConfigSchema, type ExperimentConfig, parseConfig } from "@/lib/config/experiment";
import { PERSONAS, PERSONA_BY_NUMBER } from "@/lib/agents/personas";
import { assembleSystemPrompt } from "@/lib/agents/assemble";
import { DEFAULT_SEED_BELIEF, DEFAULT_SEED_LABEL } from "@/lib/agents/seed";
import { emptyMemory, toJson } from "@/lib/types";
import { logEvent } from "./events";
import type { ExperimentRow } from "@/lib/types";

export interface CreateExperimentInput {
  title?: string;
  seed_belief?: string;
  seed_label?: string;
  config?: Partial<ExperimentConfig>;
}

/**
 * Create a new experiment in `draft` state and instantiate its agents.
 * Nothing calls the model here.
 */
export async function createExperiment(input: CreateExperimentInput): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const config = ExperimentConfigSchema.parse(input.config ?? {});
  const seedBelief = (input.seed_belief ?? DEFAULT_SEED_BELIEF).trim();
  const seedLabel = (input.seed_label ?? DEFAULT_SEED_LABEL).trim() || DEFAULT_SEED_LABEL;

  if (!config.agent_numbers.includes(config.seed_agent_number)) {
    config.agent_numbers = [...config.agent_numbers, config.seed_agent_number].sort((a, b) => a - b);
  }

  const { data: exp, error } = await db
    .from("experiments")
    .insert({
      title: input.title?.trim() || `${config.agent_numbers.length}-agent run`,
      status: "draft",
      seed_agent_number: config.seed_agent_number,
      seed_belief: seedBelief,
      seed_label: seedLabel,
      config,
    })
    .select("*")
    .single();
  if (error || !exp) throw new Error(`createExperiment: ${error?.message}`);

  await instantiateAgents(exp.id, config, seedBelief);
  await logEvent({
    experimentId: exp.id,
    kind: "EXPERIMENT_CREATED",
    message: `EXPERIMENT ${String(exp.number).padStart(3, "0")} CREATED (${config.agent_numbers.length} AGENTS, SEED A${String(config.seed_agent_number).padStart(2, "0")})`,
  });
  return exp;
}

async function instantiateAgents(experimentId: string, config: ExperimentConfig, seedBelief: string) {
  const db = supabaseAdmin();
  const personas = config.agent_numbers.map((n) => PERSONA_BY_NUMBER[n]).filter(Boolean);
  const roster = personas.map((p) => ({ code: p.code, name: p.name }));

  const agentRows = personas.map((p) => ({
    experiment_id: experimentId,
    number: p.number,
    code: p.code,
    name: p.name,
    archetype: p.archetype,
    short_description: p.short_description,
    traits: toJson(p.traits),
    is_seed: p.number === config.seed_agent_number,
    enabled: true,
    status: "idle" as const,
    memory_enabled: config.memory_enabled,
  }));
  const { data: agents, error } = await db.from("agents").insert(agentRows).select("id, number, is_seed");
  if (error || !agents) throw new Error(`instantiateAgents: ${error?.message}`);

  const promptRows = agents.map((a) => {
    const persona = PERSONA_BY_NUMBER[a.number];
    const asm = assembleSystemPrompt({
      persona,
      roster,
      isSeed: a.is_seed,
      seedBelief,
      memoryEnabled: config.memory_enabled,
    });
    return {
      agent_id: a.id,
      experiment_id: experimentId,
      base_prompt: asm.base_prompt,
      identity_prompt: asm.identity_prompt,
      seed_prompt: asm.seed_prompt,
      system_prompt: asm.system_prompt,
    };
  });
  const { error: pe } = await db.from("agent_prompts").insert(promptRows);
  if (pe) throw new Error(`agent_prompts: ${pe.message}`);

  const memRows = agents.map((a) => ({
    experiment_id: experimentId,
    agent_id: a.id,
    agent_number: a.number,
    version: 1,
    memory: toJson(emptyMemory()),
    update_kind: "init" as const,
    message_seq_at: 0,
  }));
  const { error: me } = await db.from("agent_memories").insert(memRows);
  if (me) throw new Error(`agent_memories: ${me.message}`);

  const beliefRows = agents.map((a) => ({
    experiment_id: experimentId,
    agent_id: a.id,
    agent_number: a.number,
    // The seed agent begins as a strong adopter/propagator by construction.
    exposed: a.is_seed,
    exposed_at: a.is_seed ? new Date().toISOString() : null,
    engaged: a.is_seed,
    engaged_at: a.is_seed ? new Date().toISOString() : null,
    adoption_score: a.is_seed ? 3 : 0,
    propagation_score: a.is_seed ? 3 : 0,
    peak_adoption_score: a.is_seed ? 3 : 0,
    confidence: a.is_seed ? 1 : 0,
    stage: a.is_seed ? ("propagating" as const) : ("unexposed" as const),
    stage_changed_at: a.is_seed ? new Date().toISOString() : null,
    reason_summary: a.is_seed ? "Seed agent: holds the idea by construction." : null,
  }));
  const { error: be } = await db.from("belief_states").insert(beliefRows);
  if (be) throw new Error(`belief_states: ${be.message}`);
}

export async function getExperiment(id: string): Promise<ExperimentRow | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("experiments").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

/** The experiment shown on the home page: running/paused first, else latest. */
export async function getCurrentExperiment(): Promise<ExperimentRow | null> {
  const db = supabaseAdmin();
  const { data: live } = await db
    .from("experiments")
    .select("*")
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live) return live;
  const { data: latest } = await db
    .from("experiments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return latest ?? null;
}

async function ensureNoOtherLive(exceptId: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("experiments")
    .select("id, number, status")
    .in("status", ["running", "paused"])
    .neq("id", exceptId);
  if (data && data.length > 0) {
    throw new Error(
      `Another experiment is ${data[0].status} (EXPERIMENT ${String(data[0].number).padStart(3, "0")}). Stop it first.`,
    );
  }
}

export async function startExperiment(id: string): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "draft") throw new Error(`Cannot start an experiment in status ${exp.status}`);
  await ensureNoOtherLive(id);
  const cfg = parseConfig(exp.config);
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("experiments")
    .update({ status: "running", started_at: now, resumed_at: now, paused_at: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "start failed");
  await logEvent({ experimentId: id, kind: "EXPERIMENT_STARTED", message: "EXPERIMENT STARTED" });
  await logEvent({
    experimentId: id,
    kind: "SEED_ACTIVE",
    agentNumber: cfg.seed_agent_number,
    message: `A${String(cfg.seed_agent_number).padStart(2, "0")} SEED ACTIVE`,
  });
  return data;
}

export async function pauseExperiment(id: string): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "running") throw new Error(`Cannot pause an experiment in status ${exp.status}`);
  const runningSeconds = accumulateRunning(exp);
  const { data, error } = await db
    .from("experiments")
    .update({ status: "paused", paused_at: new Date().toISOString(), resumed_at: null, running_seconds: runningSeconds })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "pause failed");
  await logEvent({ experimentId: id, kind: "EXPERIMENT_PAUSED", message: "EXPERIMENT PAUSED", messageSeqAt: exp.message_count });
  return data;
}

export async function resumeExperiment(id: string): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "paused") throw new Error(`Cannot resume an experiment in status ${exp.status}`);
  await ensureNoOtherLive(id);
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("experiments")
    .update({ status: "running", paused_at: null, resumed_at: now, started_at: exp.started_at ?? now })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "resume failed");
  await logEvent({ experimentId: id, kind: "EXPERIMENT_RESUMED", message: "EXPERIMENT RESUMED", messageSeqAt: exp.message_count });
  return data;
}

/** Seconds of running wall time so far: folded running_seconds + time since last resume. */
export function accumulateRunning(exp: Pick<ExperimentRow, "status" | "running_seconds" | "resumed_at">): number {
  if (exp.status !== "running" || !exp.resumed_at) return exp.running_seconds;
  return exp.running_seconds + Math.max(0, Math.floor((Date.now() - new Date(exp.resumed_at).getTime()) / 1000));
}

export async function stopExperiment(id: string, reason = "stopped by admin", status: "stopped" | "completed" = "stopped"): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "running" && exp.status !== "paused") throw new Error(`Cannot stop an experiment in status ${exp.status}`);
  const runningSeconds = accumulateRunning(exp);
  const finalStats = await computeFinalStats(id);
  const { data, error } = await db
    .from("experiments")
    .update({
      status,
      ended_at: new Date().toISOString(),
      end_reason: reason,
      resumed_at: null,
      running_seconds: runningSeconds,
      final_stats: toJson(finalStats),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "stop failed");
  await db.from("agents").update({ status: "idle" }).eq("experiment_id", id).neq("status", "disabled");
  await logEvent({
    experimentId: id,
    kind: status === "completed" ? "EXPERIMENT_COMPLETED" : "EXPERIMENT_STOPPED",
    message: status === "completed" ? `EXPERIMENT COMPLETE (${reason})` : `EXPERIMENT STOPPED (${reason})`,
    messageSeqAt: exp.message_count,
  });
  return data;
}

/**
 * "Reset" = archive the current experiment (stop if live) and create a fresh
 * draft with the same seed + config. Nothing is deleted.
 */
export async function resetExperiment(id: string): Promise<ExperimentRow> {
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status === "running" || exp.status === "paused") {
    await stopExperiment(id, "reset by admin");
  }
  const cfg = parseConfig(exp.config);
  const fresh = await createExperiment({
    title: exp.title,
    seed_belief: exp.seed_belief,
    seed_label: exp.seed_label,
    config: cfg,
  });
  await logEvent({ experimentId: fresh.id, kind: "EXPERIMENT_RESET", message: `RESET FROM EXPERIMENT ${String(exp.number).padStart(3, "0")}` });
  return fresh;
}

export async function updateDraftExperiment(
  id: string,
  patch: { title?: string; seed_belief?: string; seed_label?: string; config?: Partial<ExperimentConfig> },
): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "draft") throw new Error("Only draft experiments can be edited. Use Reset to create a new draft.");
  const cfg = ExperimentConfigSchema.parse({ ...parseConfig(exp.config), ...(patch.config ?? {}) });
  const seedBelief = (patch.seed_belief ?? exp.seed_belief).trim();
  const seedLabel = (patch.seed_label ?? exp.seed_label).trim() || DEFAULT_SEED_LABEL;
  if (!cfg.agent_numbers.includes(cfg.seed_agent_number)) {
    cfg.agent_numbers = [...cfg.agent_numbers, cfg.seed_agent_number].sort((a, b) => a - b);
  }
  // Re-instantiate agents (draft only): simplest correct approach.
  await db.from("agents").delete().eq("experiment_id", id);
  const { data, error } = await db
    .from("experiments")
    .update({
      title: patch.title?.trim() || exp.title,
      seed_belief: seedBelief,
      seed_label: seedLabel,
      seed_agent_number: cfg.seed_agent_number,
      config: cfg,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "update failed");
  await instantiateAgents(id, cfg, seedBelief);
  return data;
}

/** Live-editable config fields (allowed while running/paused). */
export async function updateLiveConfig(id: string, patch: Partial<ExperimentConfig>): Promise<ExperimentRow> {
  const db = supabaseAdmin();
  const exp = await getExperiment(id);
  if (!exp) throw new Error("Experiment not found");
  const allowed: (keyof ExperimentConfig)[] = [
    "model", "judge_model", "temperature", "max_tokens_per_response", "messages_per_minute", "max_messages",
    "budget_usd", "agent_cooldown_seconds", "concurrent_calls", "turns_per_tick", "context_window_messages",
    "retrieved_mentions", "memory_consolidate_every_n_turns", "final_memory_write", "judge_every_n_messages",
    "tag_every_n_messages", "topic_rotation_every_n_messages", "max_consecutive_messages_per_agent",
  ];
  const current = parseConfig(exp.config);
  const next: ExperimentConfig = { ...current };
  for (const k of allowed) {
    if (k in patch && patch[k] !== undefined) (next as Record<string, unknown>)[k] = patch[k];
  }
  const cfg = ExperimentConfigSchema.parse(next);
  const { data, error } = await db.from("experiments").update({ config: cfg }).eq("id", id).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "update failed");
  return data;
}

export async function computeFinalStats(experimentId: string): Promise<Record<string, unknown>> {
  const db = supabaseAdmin();
  const [{ data: states }, { data: agents }, { data: exp }] = await Promise.all([
    db.from("belief_states").select("*").eq("experiment_id", experimentId),
    db.from("agents").select("number, code, name, is_seed, message_count").eq("experiment_id", experimentId),
    db.from("experiments").select("*").eq("id", experimentId).single(),
  ]);
  const nonSeed = (states ?? []).filter((s) => !(agents ?? []).find((a) => a.number === s.agent_number)?.is_seed);
  const count = (pred: (s: (typeof nonSeed)[number]) => boolean) => nonSeed.filter(pred).length;
  return {
    agents: agents?.length ?? 0,
    non_seed_agents: nonSeed.length,
    exposed: count((s) => s.exposed),
    engaged: count((s) => s.engaged),
    considering: count((s) => s.adoption_score >= 2 || s.stage === "considering"),
    partial: count((s) => s.adoption_score === 2),
    strong: count((s) => s.adoption_score >= 3),
    propagating: count((s) => s.propagation_score >= 2),
    adoption_rate: nonSeed.length ? count((s) => s.adoption_score >= 2) / nonSeed.length : 0,
    strong_adoption_rate: nonSeed.length ? count((s) => s.adoption_score >= 3) / nonSeed.length : 0,
    messages: exp?.message_count ?? 0,
    llm_calls: exp?.total_llm_calls ?? 0,
    prompt_tokens: exp?.total_prompt_tokens ?? 0,
    completion_tokens: exp?.total_completion_tokens ?? 0,
    cost_usd: exp?.total_cost_usd ?? 0,
  };
}

export const ALL_PERSONAS = PERSONAS;
