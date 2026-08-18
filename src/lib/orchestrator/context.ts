import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AgentRow, MessageRow } from "@/lib/types";
import type { ExperimentConfig } from "@/lib/config/experiment";
import { PERSONAS } from "@/lib/agents/personas";

export interface AgentContext {
  recent: MessageRow[]; // chronological
  retrieved: MessageRow[]; // earlier messages that addressed/mentioned the agent (chronological)
  fromSeq: number | null;
  toSeq: number | null;
}

/**
 * Rolling context for one agent:
 *  - the last N room messages (agent + system) after the agent's context epoch boundary
 *  - up to K earlier messages that addressed or referenced this agent (simple retrieval)
 * The full transcript is never sent.
 */
export async function buildAgentContext(
  experimentId: string,
  agent: Pick<AgentRow, "id" | "number" | "context_cleared_at">,
  config: ExperimentConfig,
): Promise<AgentContext> {
  const db = supabaseAdmin();
  let q = db
    .from("messages")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("seq", { ascending: false })
    .limit(config.context_window_messages);
  if (agent.context_cleared_at) q = q.gt("created_at", agent.context_cleared_at);
  const { data: recentDesc } = await q;
  const recent = (recentDesc ?? []).slice().reverse();
  const minSeq = recent.length ? recent[0].seq : null;

  let retrieved: MessageRow[] = [];
  if (config.retrieved_mentions > 0 && minSeq !== null) {
    let rq = db
      .from("messages")
      .select("*")
      .eq("experiment_id", experimentId)
      .eq("kind", "agent")
      .lt("seq", minSeq)
      .or(`addressed_agent_numbers.cs.{${agent.number}},referenced_agent_numbers.cs.{${agent.number}}`)
      .order("seq", { ascending: false })
      .limit(config.retrieved_mentions);
    if (agent.context_cleared_at) rq = rq.gt("created_at", agent.context_cleared_at);
    const { data } = await rq;
    retrieved = (data ?? []).slice().reverse();
  }
  return {
    recent,
    retrieved,
    fromSeq: retrieved.length ? retrieved[0].seq : minSeq,
    toSeq: recent.length ? recent[recent.length - 1].seq : null,
  };
}

const NAME_TO_NUMBER: Record<string, number> = Object.fromEntries(PERSONAS.map((p) => [p.name, p.number]));

export function formatMessageLine(m: MessageRow): string {
  const t = new Date(m.created_at);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  if (m.kind === "system") return `[#${m.seq} ${hh}:${mm}] [SYSTEM]: ${m.content}`;
  const to = m.addressed_agent_numbers?.length
    ? ` -> ${m.addressed_agent_numbers.map((n) => `A${String(n).padStart(2, "0")}`).join(", ")}`
    : "";
  return `[#${m.seq} ${hh}:${mm}] [${m.agent_code} / ${m.agent_name}${to}]: ${m.content}`;
}

export function formatTranscript(msgs: MessageRow[]): string {
  return msgs.map(formatMessageLine).join("\n\n");
}

/** Parse "A07" codes and role names (e.g. "SKEPTIC") from text into agent numbers. */
export function parseReferencedAgents(text: string, selfNumber: number, roster: number[]): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/\bA(\d{2})\b/g)) {
    const n = parseInt(m[1], 10);
    if (roster.includes(n) && n !== selfNumber) found.add(n);
  }
  for (const [name, n] of Object.entries(NAME_TO_NUMBER)) {
    if (!roster.includes(n) || n === selfNumber) continue;
    const re = new RegExp(`\\b${name.replace("_", "[ _']?")}\\b`, "i");
    if (re.test(text)) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

export function parseCodes(codes: unknown, selfNumber: number, roster: number[]): number[] {
  if (!Array.isArray(codes)) return [];
  const out = new Set<number>();
  for (const c of codes) {
    if (typeof c !== "string") continue;
    const m = c.trim().toUpperCase().match(/^A?(\d{1,2})$/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (roster.includes(n) && n !== selfNumber) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}
