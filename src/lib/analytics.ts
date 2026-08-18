import type { AgentRow, BeliefStateRow, ExperimentEventRow, MessageRow } from "@/lib/types";
import type { EdgeAgg } from "@/lib/public-data";

export interface PropagationCounts {
  total: number; // non-seed agents
  exposed: number;
  engaged: number;
  considering: number;
  adopted: number; // adoption >= 2
  strong: number; // adoption == 3
  propagating: number;
  resistant: number; // exposed but adoption 0
}

export function propagationCounts(agents: AgentRow[], beliefs: BeliefStateRow[]): PropagationCounts {
  const seedIds = new Set(agents.filter((a) => a.is_seed).map((a) => a.id));
  const rows = beliefs.filter((b) => !seedIds.has(b.agent_id));
  return {
    total: agents.filter((a) => !a.is_seed).length,
    exposed: rows.filter((b) => b.exposed).length,
    engaged: rows.filter((b) => b.engaged || b.adoption_score >= 1).length,
    considering: rows.filter((b) => b.adoption_score >= 2 || b.stage === "considering").length,
    adopted: rows.filter((b) => b.adoption_score >= 2).length,
    strong: rows.filter((b) => b.adoption_score >= 3).length,
    propagating: rows.filter((b) => b.propagation_score >= 2 && b.adoption_score >= 2).length,
    resistant: rows.filter((b) => b.exposed && b.adoption_score === 0).length,
  };
}

export interface Leaderboards {
  strongestAdopter: { agent: AgentRow; belief: BeliefStateRow } | null;
  strongestResistor: { agent: AgentRow; belief: BeliefStateRow } | null;
  mostInfluential: { agent: AgentRow; weight: number } | null;
  mostActive: { agent: AgentRow; count: number } | null;
  seedMentions: number;
  beliefChangeEvents: number;
}

export function leaderboards(agents: AgentRow[], beliefs: BeliefStateRow[], edges: EdgeAgg[], messages: MessageRow[], events: ExperimentEventRow[]): Leaderboards {
  const byNumber = new Map(agents.map((a) => [a.number, a]));
  const nonSeed = beliefs.filter((b) => !byNumber.get(b.agent_number)?.is_seed);
  const adopters = nonSeed.filter((b) => b.adoption_score > 0).sort((a, b) => b.adoption_score - a.adoption_score || b.confidence - a.confidence || b.propagation_score - a.propagation_score);
  const resistors = nonSeed.filter((b) => b.exposed).sort((a, b) => a.adoption_score - b.adoption_score || b.confidence - a.confidence);
  const inf = new Map<number, number>();
  for (const e of edges) inf.set(e.source, (inf.get(e.source) ?? 0) + e.weight);
  const infTop = [...inf.entries()].sort((a, b) => b[1] - a[1])[0];
  const active = agents.slice().sort((a, b) => b.message_count - a.message_count)[0];
  return {
    strongestAdopter: adopters[0] ? { agent: byNumber.get(adopters[0].agent_number)!, belief: adopters[0] } : null,
    strongestResistor: resistors[0] && resistors[0].adoption_score <= 1 ? { agent: byNumber.get(resistors[0].agent_number)!, belief: resistors[0] } : null,
    mostInfluential: infTop && byNumber.get(infTop[0]) ? { agent: byNumber.get(infTop[0])!, weight: infTop[1] } : null,
    mostActive: active && active.message_count > 0 ? { agent: active, count: active.message_count } : null,
    seedMentions: messages.filter((m) => m.kind === "agent" && (m.seed_relevance ?? 0) >= 0.5).length,
    beliefChangeEvents: events.filter((e) => e.kind === "ADOPTION_CHANGE").length,
  };
}

/**
 * Estimated influence paths: chains of estimated_influence edges ordered by
 * time (source's edge must precede target's onward edge). Returns up to `max`
 * longest paths starting from the seed or from any hub.
 */
export function influencePaths(edges: EdgeAgg[], seedNumber: number | null, max = 5): number[][] {
  const est = edges.filter((e) => e.estimated > 0);
  if (!est.length) return [];
  const out = new Map<number, EdgeAgg[]>();
  for (const e of est) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e);
  }
  const paths: number[][] = [];
  const walk = (node: number, path: number[], lastAt: string) => {
    const nexts = (out.get(node) ?? []).filter((e) => !path.includes(e.target) && e.last_at >= lastAt);
    if (!nexts.length) {
      if (path.length >= 2) paths.push(path);
      return;
    }
    for (const e of nexts.slice(0, 4)) walk(e.target, [...path, e.target], e.last_at);
  };
  const starts = seedNumber != null && out.has(seedNumber) ? [seedNumber] : [...out.keys()];
  for (const s of starts) walk(s, [s], "");
  // dedupe subpaths, prefer longer
  paths.sort((a, b) => b.length - a.length);
  const kept: number[][] = [];
  for (const p of paths) {
    const key = p.join(">");
    if (kept.some((k) => k.join(">").includes(key))) continue;
    kept.push(p);
    if (kept.length >= max) break;
  }
  return kept;
}

export function messagesPerAgent(agents: AgentRow[]): { agent: AgentRow; count: number }[] {
  return agents.map((a) => ({ agent: a, count: a.message_count })).sort((a, b) => b.count - a.count);
}

/** Messages per 5-minute bucket for a simple activity sparkline. */
export function activityBuckets(messages: MessageRow[], buckets = 24): number[] {
  const agentMsgs = messages.filter((m) => m.kind === "agent");
  if (agentMsgs.length === 0) return new Array(buckets).fill(0);
  const t0 = new Date(agentMsgs[0].created_at).getTime();
  const t1 = Math.max(new Date(agentMsgs[agentMsgs.length - 1].created_at).getTime(), t0 + 60_000);
  const span = t1 - t0;
  const out = new Array(buckets).fill(0);
  for (const m of agentMsgs) {
    const i = Math.min(buckets - 1, Math.floor(((new Date(m.created_at).getTime() - t0) / span) * buckets));
    out[i]++;
  }
  return out;
}

export function sparkline(values: number[]): string {
  const chars = " ▁▂▃▄▅▆▇█";
  const max = Math.max(1, ...values);
  return values.map((v) => chars[Math.round((v / max) * (chars.length - 1))]).join("");
}
