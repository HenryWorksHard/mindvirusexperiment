import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentExperiment } from "@/lib/experiment/service";
import { availableModels, defaultModel } from "@/lib/llm";
import { PERSONAS } from "@/lib/agents/personas";
import { TOPICS } from "@/lib/agents/topics";
import { DEFAULT_SEED_BELIEF, DEFAULT_SEED_LABEL } from "@/lib/agents/seed";
import { defaultConfig, isTestModeEnv, testModeConfig } from "@/lib/config/experiment";
import type { AgentRow, BeliefStateRow, ExperimentRow, LlmCallRow } from "@/lib/types";
import { getSiteLinks } from "@/lib/public-data";

export interface UsageSummary {
  total: { calls: number; prompt_tokens: number; completion_tokens: number; reasoning_tokens: number; cost_usd: number; errors: number };
  byPurpose: Record<string, { calls: number; cost_usd: number; prompt_tokens: number; completion_tokens: number }>;
  byModel: Record<string, { calls: number; cost_usd: number }>;
  recentErrors: Pick<LlmCallRow, "created_at" | "purpose" | "model" | "status" | "error">[];
  last24hCost: number;
}

export async function getUsageSummary(experimentId?: string | null): Promise<UsageSummary> {
  const db = supabaseAdmin();
  let q = db.from("llm_calls").select("purpose, model, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, status, error, created_at").order("created_at", { ascending: false }).limit(5000);
  if (experimentId) q = q.eq("experiment_id", experimentId);
  const { data } = await q;
  const rows = data ?? [];
  const total = { calls: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cost_usd: 0, errors: 0 };
  const byPurpose: UsageSummary["byPurpose"] = {};
  const byModel: UsageSummary["byModel"] = {};
  const dayAgo = Date.now() - 24 * 3600_000;
  let last24hCost = 0;
  for (const r of rows) {
    total.calls++;
    total.prompt_tokens += r.prompt_tokens;
    total.completion_tokens += r.completion_tokens;
    total.reasoning_tokens += r.reasoning_tokens;
    total.cost_usd += Number(r.cost_usd);
    if (r.status !== "ok") total.errors++;
    const p = (byPurpose[r.purpose] ??= { calls: 0, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0 });
    p.calls++;
    p.cost_usd += Number(r.cost_usd);
    p.prompt_tokens += r.prompt_tokens;
    p.completion_tokens += r.completion_tokens;
    const m = (byModel[r.model] ??= { calls: 0, cost_usd: 0 });
    m.calls++;
    m.cost_usd += Number(r.cost_usd);
    if (new Date(r.created_at).getTime() > dayAgo) last24hCost += Number(r.cost_usd);
  }
  return {
    total,
    byPurpose,
    byModel,
    recentErrors: rows.filter((r) => r.status !== "ok").slice(0, 10).map((r) => ({ created_at: r.created_at, purpose: r.purpose, model: r.model, status: r.status, error: r.error })),
    last24hCost,
  };
}

export interface AdminState {
  current: ExperimentRow | null;
  experiments: ExperimentRow[];
  agents: AgentRow[];
  beliefs: BeliefStateRow[];
  usage: UsageSummary;
  lease: { holder: string; expires_at: string; updated_at: string } | null;
  models: { id: string; label: string; inputPerMTok: number; outputPerMTok: number; reasoning: boolean; notes?: string }[];
  defaults: { model: string; seed_belief: string; seed_label: string; config: ReturnType<typeof defaultConfig>; testConfig: ReturnType<typeof testModeConfig>; testModeEnv: boolean };
  personas: { number: number; code: string; name: string; archetype: string; short_description: string }[];
  topics: { id: string; title: string }[];
  links: Awaited<ReturnType<typeof getSiteLinks>>;
  env: { appUrl: string; runnerConfigured: boolean };
}

export async function getAdminState(): Promise<AdminState> {
  const db = supabaseAdmin();
  const current = await getCurrentExperiment();
  const [{ data: experiments }, agents, beliefs, usage, { data: lease }, links] = await Promise.all([
    db.from("experiments").select("*").order("number", { ascending: false }).limit(50),
    current ? db.from("agents").select("*").eq("experiment_id", current.id).order("number") : Promise.resolve({ data: [] as AgentRow[] }),
    current ? db.from("belief_states").select("*").eq("experiment_id", current.id).order("agent_number") : Promise.resolve({ data: [] as BeliefStateRow[] }),
    getUsageSummary(current?.id ?? null),
    db.from("runner_leases").select("holder, expires_at, updated_at").eq("key", "runner").maybeSingle(),
    getSiteLinks(),
  ]);
  return {
    current,
    experiments: experiments ?? [],
    agents: agents.data ?? [],
    beliefs: beliefs.data ?? [],
    usage,
    lease: lease ?? null,
    models: availableModels(),
    defaults: {
      model: defaultModel(),
      seed_belief: DEFAULT_SEED_BELIEF,
      seed_label: DEFAULT_SEED_LABEL,
      config: defaultConfig({ model: defaultModel(), judge_model: defaultModel() }),
      testConfig: testModeConfig({ model: defaultModel(), judge_model: defaultModel() }),
      testModeEnv: isTestModeEnv(),
    },
    personas: PERSONAS.map((p) => ({ number: p.number, code: p.code, name: p.name, archetype: p.archetype, short_description: p.short_description })),
    topics: TOPICS.map((t) => ({ id: t.id, title: t.title })),
    links,
    env: { appUrl: process.env.APP_URL ?? "", runnerConfigured: Boolean(process.env.RUNNER_SECRET) },
  };
}
