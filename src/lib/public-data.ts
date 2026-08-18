import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  AdoptionEvaluationRow,
  AgentMemoryRow,
  AgentRow,
  BeliefStateRow,
  ExperimentEventRow,
  ExperimentRow,
  InfluenceEdgeRow,
  MessageRow,
  SiteLinks,
} from "@/lib/types";

export interface EdgeAgg {
  source: number;
  target: number;
  reply: number;
  mention: number;
  estimated: number;
  weight: number;
  last_at: string;
}

export interface LiveSnapshot {
  experiment: ExperimentRow | null;
  agents: AgentRow[];
  beliefs: BeliefStateRow[];
  messages: MessageRow[];
  events: ExperimentEventRow[];
  edges: EdgeAgg[];
  usage: { calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number };
}

export async function getSiteLinks(): Promise<SiteLinks> {
  const db = supabaseAdmin();
  const { data } = await db.from("site_settings").select("value").eq("key", "links").maybeSingle();
  const v = (data?.value ?? {}) as Partial<SiteLinks>;
  return {
    x_url: v.x_url ?? "https://x.com/themindvirusexp",
    contract_address: v.contract_address ?? null,
    contract_label: v.contract_label ?? "CA",
  };
}

export function aggregateEdges(rows: Pick<InfluenceEdgeRow, "source_agent_number" | "target_agent_number" | "kind" | "weight" | "created_at">[]): EdgeAgg[] {
  const map = new Map<string, EdgeAgg>();
  for (const e of rows) {
    const key = `${e.source_agent_number}->${e.target_agent_number}`;
    const cur = map.get(key) ?? { source: e.source_agent_number, target: e.target_agent_number, reply: 0, mention: 0, estimated: 0, weight: 0, last_at: e.created_at };
    if (e.kind === "reply") cur.reply += 1;
    else if (e.kind === "mention") cur.mention += 1;
    else cur.estimated += e.weight;
    cur.weight += e.kind === "estimated_influence" ? e.weight * 2 : e.weight;
    if (e.created_at > cur.last_at) cur.last_at = e.created_at;
    map.set(key, cur);
  }
  return [...map.values()];
}

export async function getLiveSnapshot(experimentId: string | null, opts: { messageLimit?: number; eventLimit?: number } = {}): Promise<LiveSnapshot> {
  const db = supabaseAdmin();
  if (!experimentId) return { experiment: null, agents: [], beliefs: [], messages: [], events: [], edges: [], usage: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 } };
  const messageLimit = opts.messageLimit ?? 200;
  const eventLimit = opts.eventLimit ?? 120;
  const [exp, agents, beliefs, messages, events, edges] = await Promise.all([
    db.from("experiments").select("*").eq("id", experimentId).maybeSingle(),
    db.from("agents").select("*").eq("experiment_id", experimentId).order("number"),
    db.from("belief_states").select("*").eq("experiment_id", experimentId).order("agent_number"),
    db.from("messages").select("*").eq("experiment_id", experimentId).order("seq", { ascending: false }).limit(messageLimit),
    db.from("experiment_events").select("*").eq("experiment_id", experimentId).order("created_at", { ascending: false }).limit(eventLimit),
    db.from("influence_edges").select("source_agent_number, target_agent_number, kind, weight, created_at").eq("experiment_id", experimentId).order("created_at", { ascending: true }).limit(5000),
  ]);
  const e = exp.data ?? null;
  return {
    experiment: e,
    agents: agents.data ?? [],
    beliefs: beliefs.data ?? [],
    messages: (messages.data ?? []).slice().reverse(),
    events: (events.data ?? []).slice().reverse(),
    edges: aggregateEdges(edges.data ?? []),
    usage: {
      calls: e?.total_llm_calls ?? 0,
      prompt_tokens: Number(e?.total_prompt_tokens ?? 0),
      completion_tokens: Number(e?.total_completion_tokens ?? 0),
      cost_usd: Number(e?.total_cost_usd ?? 0),
    },
  };
}

export interface AgentDetail {
  agent: AgentRow;
  belief: BeliefStateRow | null;
  memory: AgentMemoryRow | null;
  memoryHistory: Pick<AgentMemoryRow, "version" | "update_kind" | "created_at" | "message_seq_at">[];
  evaluations: AdoptionEvaluationRow[];
  messages: MessageRow[];
  influencesIn: EdgeAgg[]; // who influenced this agent
  influencesOut: EdgeAgg[]; // whom this agent influenced
  turns: { spoke: boolean; pass_reason: string | null; created_at: string }[];
}

export async function getAgentDetail(agentId: string): Promise<AgentDetail | null> {
  const db = supabaseAdmin();
  const { data: agent } = await db.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) return null;
  const [belief, memory, memHist, evals, msgs, edgesIn, edgesOut, turns] = await Promise.all([
    db.from("belief_states").select("*").eq("agent_id", agentId).maybeSingle(),
    db.from("agent_memories").select("*").eq("agent_id", agentId).order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("agent_memories").select("version, update_kind, created_at, message_seq_at").eq("agent_id", agentId).order("version", { ascending: false }).limit(30),
    db.from("adoption_evaluations").select("*").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(20),
    db.from("messages").select("*").eq("agent_id", agentId).order("seq", { ascending: false }).limit(30),
    db.from("influence_edges").select("source_agent_number, target_agent_number, kind, weight, created_at").eq("target_agent_id", agentId).limit(2000),
    db.from("influence_edges").select("source_agent_number, target_agent_number, kind, weight, created_at").eq("source_agent_id", agentId).limit(2000),
    db.from("agent_turns").select("spoke, pass_reason, created_at").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    agent,
    belief: belief.data ?? null,
    memory: memory.data ?? null,
    memoryHistory: memHist.data ?? [],
    evaluations: evals.data ?? [],
    messages: (msgs.data ?? []).slice().reverse(),
    influencesIn: aggregateEdges(edgesIn.data ?? []).sort((a, b) => b.weight - a.weight),
    influencesOut: aggregateEdges(edgesOut.data ?? []).sort((a, b) => b.weight - a.weight),
    turns: turns.data ?? [],
  };
}

export async function listExperiments(): Promise<ExperimentRow[]> {
  const db = supabaseAdmin();
  const { data } = await db.from("experiments").select("*").order("number", { ascending: false }).limit(200);
  return data ?? [];
}

export async function getExperimentByNumber(number: number): Promise<ExperimentRow | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("experiments").select("*").eq("number", number).maybeSingle();
  return data ?? null;
}

/** Adoption timeline: cumulative counts per stage at each evaluation point (non-seed agents). */
export async function getAdoptionTimeline(experimentId: string): Promise<{ t: string; seq: number; exposed: number; engaged: number; partial: number; strong: number; propagating: number }[]> {
  const db = supabaseAdmin();
  const [{ data: evals }, { data: agents }] = await Promise.all([
    db.from("adoption_evaluations").select("agent_number, exposure, engagement, adoption_score, propagation_score, created_at, message_seq_at").eq("experiment_id", experimentId).order("created_at", { ascending: true }).limit(5000),
    db.from("agents").select("number, is_seed").eq("experiment_id", experimentId),
  ]);
  const seedNums = new Set((agents ?? []).filter((a) => a.is_seed).map((a) => a.number));
  const latest = new Map<number, { exposure: boolean; engagement: boolean; adoption: number; propagation: number }>();
  const out: { t: string; seq: number; exposed: number; engaged: number; partial: number; strong: number; propagating: number }[] = [];
  const snapshot = (t: string, seq: number) => {
    let exposed = 0, engaged = 0, partial = 0, strong = 0, propagating = 0;
    for (const [n, s] of latest) {
      if (seedNums.has(n)) continue;
      if (s.exposure) exposed++;
      if (s.engagement || s.adoption >= 1) engaged++;
      if (s.adoption >= 2) partial++;
      if (s.adoption >= 3) strong++;
      if (s.propagation >= 2 && s.adoption >= 2) propagating++;
    }
    out.push({ t, seq, exposed, engaged, partial, strong, propagating });
  };
  for (const e of evals ?? []) {
    latest.set(e.agent_number, { exposure: e.exposure, engagement: e.engagement, adoption: e.adoption_score, propagation: e.propagation_score });
    snapshot(e.created_at, e.message_seq_at);
  }
  return out;
}
