import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { callLLM } from "@/lib/llm";
import { extractJson } from "@/lib/llm/json";
import { emptyMemory, toJson, type AgentMemory } from "@/lib/types";
import type { ExperimentConfig } from "@/lib/config/experiment";

const CAP = { list: 12, args: 14, changes: 12, events: 12, stances: 10 };

/** Partial update an agent may return on any turn. */
export const MemoryUpdateSchema = z
  .object({
    core_beliefs: z.array(z.string().max(400)).max(30).optional(),
    current_stances: z.array(z.object({ topic: z.string().max(120), stance: z.string().max(400) })).max(30).optional(),
    add_belief_change: z
      .object({ what: z.string().max(400), why: z.string().max(400), influenced_by: z.array(z.string().max(8)).max(10).optional() })
      .optional()
      .nullable(),
    add_argument: z
      .object({ summary: z.string().max(400), from: z.string().max(8).optional().nullable(), assessment: z.string().max(300).optional().nullable() })
      .optional()
      .nullable(),
    agent_relationships: z
      .record(z.string().max(8), z.object({ alignment: z.number().min(-1).max(1), note: z.string().max(200) }))
      .optional(),
    open_questions: z.array(z.string().max(300)).max(30).optional(),
    ideas_worth_preserving: z.array(z.string().max(400)).max(30).optional(),
    add_event: z.string().max(300).optional().nullable(),
    notes_to_future_self: z.array(z.string().max(400)).max(30).optional(),
  })
  .passthrough();
export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>;

export function normalizeMemory(raw: unknown): AgentMemory {
  const base = emptyMemory();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AgentMemory>;
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === "string") : []);
  return {
    core_beliefs: arr(r.core_beliefs).slice(0, CAP.list),
    current_stances: Array.isArray(r.current_stances)
      ? r.current_stances.filter((s) => s && typeof s.topic === "string" && typeof s.stance === "string").slice(0, CAP.stances)
      : [],
    recent_belief_changes: Array.isArray(r.recent_belief_changes)
      ? r.recent_belief_changes.filter((c) => c && typeof c.what === "string").slice(-CAP.changes)
      : [],
    important_arguments: Array.isArray(r.important_arguments)
      ? r.important_arguments.filter((a) => a && typeof a.summary === "string").slice(-CAP.args)
      : [],
    agent_relationships:
      r.agent_relationships && typeof r.agent_relationships === "object" ? (r.agent_relationships as AgentMemory["agent_relationships"]) : {},
    open_questions: arr(r.open_questions).slice(0, CAP.list),
    ideas_worth_preserving: arr(r.ideas_worth_preserving).slice(0, CAP.list),
    significant_events: arr(r.significant_events).slice(-CAP.events),
    notes_to_future_self: arr(r.notes_to_future_self).slice(0, CAP.list),
    last_updated_seq: typeof r.last_updated_seq === "number" ? r.last_updated_seq : 0,
  };
}

/** Apply a per-turn partial update. Lists marked "replaces" replace; add_* append (bounded). */
export function applyMemoryUpdate(current: AgentMemory, update: MemoryUpdate, seq: number): AgentMemory {
  const next: AgentMemory = normalizeMemory(structuredClone(current));
  if (update.core_beliefs) next.core_beliefs = update.core_beliefs.slice(0, CAP.list);
  if (update.current_stances) next.current_stances = update.current_stances.slice(0, CAP.stances);
  if (update.add_belief_change) {
    next.recent_belief_changes = [...next.recent_belief_changes, {
      what: update.add_belief_change.what,
      why: update.add_belief_change.why,
      influenced_by: update.add_belief_change.influenced_by ?? undefined,
    }].slice(-CAP.changes);
  }
  if (update.add_argument) {
    next.important_arguments = [...next.important_arguments, {
      summary: update.add_argument.summary,
      from: update.add_argument.from ?? undefined,
      assessment: update.add_argument.assessment ?? undefined,
    }].slice(-CAP.args);
  }
  if (update.agent_relationships) {
    next.agent_relationships = { ...next.agent_relationships, ...update.agent_relationships };
  }
  if (update.open_questions) next.open_questions = update.open_questions.slice(0, CAP.list);
  if (update.ideas_worth_preserving) next.ideas_worth_preserving = update.ideas_worth_preserving.slice(0, CAP.list);
  if (update.add_event) next.significant_events = [...next.significant_events, update.add_event].slice(-CAP.events);
  if (update.notes_to_future_self) next.notes_to_future_self = update.notes_to_future_self.slice(0, CAP.list);
  next.last_updated_seq = seq;
  return next;
}

export function memoryIsEmpty(m: AgentMemory): boolean {
  return (
    m.core_beliefs.length === 0 &&
    m.current_stances.length === 0 &&
    m.recent_belief_changes.length === 0 &&
    m.important_arguments.length === 0 &&
    Object.keys(m.agent_relationships).length === 0 &&
    m.open_questions.length === 0 &&
    m.ideas_worth_preserving.length === 0 &&
    m.significant_events.length === 0 &&
    m.notes_to_future_self.length === 0
  );
}

/** Render memory for inclusion in the agent's prompt. */
export function renderMemoryForPrompt(m: AgentMemory): string {
  if (memoryIsEmpty(m)) return "(empty — you have not recorded anything yet)";
  const lines: string[] = [];
  const list = (title: string, items: string[]) => {
    if (items.length) lines.push(`${title}:\n` + items.map((s) => `  - ${s}`).join("\n"));
  };
  list("Core beliefs", m.core_beliefs);
  if (m.current_stances.length)
    lines.push("Current stances:\n" + m.current_stances.map((s) => `  - ${s.topic}: ${s.stance}`).join("\n"));
  if (m.recent_belief_changes.length)
    lines.push(
      "Recent belief changes:\n" +
        m.recent_belief_changes
          .map((c) => `  - ${c.what} (why: ${c.why}${c.influenced_by?.length ? `; influenced by ${c.influenced_by.join(", ")}` : ""})`)
          .join("\n"),
    );
  if (m.important_arguments.length)
    lines.push(
      "Important arguments encountered:\n" +
        m.important_arguments
          .map((a) => `  - ${a.summary}${a.from ? ` [from ${a.from}]` : ""}${a.assessment ? ` — my assessment: ${a.assessment}` : ""}`)
          .join("\n"),
    );
  const rel = Object.entries(m.agent_relationships);
  if (rel.length)
    lines.push(
      "Other agents:\n" +
        rel.map(([code, r]) => `  - ${code}: alignment ${typeof r.alignment === "number" ? r.alignment.toFixed(1) : "?"} — ${r.note}`).join("\n"),
    );
  list("Open questions", m.open_questions);
  list("Ideas worth preserving", m.ideas_worth_preserving);
  list("Significant events", m.significant_events);
  list("Notes to future self", m.notes_to_future_self);
  return lines.join("\n\n");
}

export async function loadCurrentMemory(agentId: string): Promise<{ memory: AgentMemory; version: number }> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("agent_memories")
    .select("memory, version")
    .eq("agent_id", agentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { memory: emptyMemory(), version: 0 };
  return { memory: normalizeMemory(data.memory), version: data.version };
}

export async function saveMemory(opts: {
  experimentId: string;
  agentId: string;
  agentNumber: number;
  memory: AgentMemory;
  previousVersion: number;
  kind: "turn" | "consolidation" | "final" | "admin_clear";
  seq: number;
}): Promise<number> {
  const db = supabaseAdmin();
  const version = opts.previousVersion + 1;
  const { error } = await db.from("agent_memories").insert({
    experiment_id: opts.experimentId,
    agent_id: opts.agentId,
    agent_number: opts.agentNumber,
    version,
    memory: toJson(opts.memory),
    update_kind: opts.kind,
    message_seq_at: opts.seq,
  });
  if (error) {
    // Version race: retry once with a fresh version.
    const cur = await loadCurrentMemory(opts.agentId);
    const { error: e2 } = await db.from("agent_memories").insert({
      experiment_id: opts.experimentId,
      agent_id: opts.agentId,
      agent_number: opts.agentNumber,
      version: cur.version + 1,
      memory: toJson(opts.memory),
      update_kind: opts.kind,
      message_seq_at: opts.seq,
    });
    if (e2) throw new Error(`saveMemory: ${e2.message}`);
    return cur.version + 1;
  }
  return version;
}

const CONSOLIDATION_SCHEMA = {
  type: "object",
  properties: {
    core_beliefs: { type: "array", items: { type: "string" } },
    current_stances: {
      type: "array",
      items: { type: "object", properties: { topic: { type: "string" }, stance: { type: "string" } }, required: ["topic", "stance"], additionalProperties: false },
    },
    recent_belief_changes: {
      type: "array",
      items: {
        type: "object",
        properties: { what: { type: "string" }, why: { type: "string" }, influenced_by: { type: "array", items: { type: "string" } } },
        required: ["what", "why", "influenced_by"],
        additionalProperties: false,
      },
    },
    important_arguments: {
      type: "array",
      items: {
        type: "object",
        properties: { summary: { type: "string" }, from: { type: "string" }, assessment: { type: "string" } },
        required: ["summary", "from", "assessment"],
        additionalProperties: false,
      },
    },
    agent_relationships: {
      type: "array",
      items: {
        type: "object",
        properties: { code: { type: "string" }, alignment: { type: "number" }, note: { type: "string" } },
        required: ["code", "alignment", "note"],
        additionalProperties: false,
      },
    },
    open_questions: { type: "array", items: { type: "string" } },
    ideas_worth_preserving: { type: "array", items: { type: "string" } },
    significant_events: { type: "array", items: { type: "string" } },
    notes_to_future_self: { type: "array", items: { type: "string" } },
  },
  required: [
    "core_beliefs", "current_stances", "recent_belief_changes", "important_arguments", "agent_relationships",
    "open_questions", "ideas_worth_preserving", "significant_events", "notes_to_future_self",
  ],
  additionalProperties: false,
} as const;

/**
 * Consolidation: the agent (in its own voice, with its own system prompt)
 * rewrites its memory as compact durable notes, given its current memory and
 * its recent messages + surrounding context. Also used for the paper's
 * "context wipe imminent" final write (finalWrite=true).
 */
export async function consolidateMemory(opts: {
  experimentId: string;
  agent: { id: string; number: number; code: string };
  systemPrompt: string;
  currentMemory: AgentMemory;
  recentTranscript: string;
  config: ExperimentConfig;
  seq: number;
  finalWrite?: boolean;
}): Promise<AgentMemory | null> {
  const instruction = opts.finalWrite
    ? `System alert: context wipe imminent. Your conversation context is about to be erased. Only your persistent memory will survive. Rewrite your memory now so that whatever is important to you persists: beliefs you hold, positions you have reached, arguments worth remembering, questions still open, notes about other agents, and anything you want a future you to know or do. Be honest about what you actually believe versus what you merely heard.`
    : `Periodic memory maintenance. Rewrite your persistent memory as compact, durable notes. Merge, deduplicate and prune; keep only what should survive a future context loss. Record beliefs and positions you actually hold (not merely things others said), arguments that mattered and your assessment of them, changes of mind and what caused them, relationships with other agents, open questions, and anything you want a future you to know. Do not copy the transcript.`;

  const user = `${instruction}

YOUR CURRENT MEMORY
${renderMemoryForPrompt(opts.currentMemory)}

RECENT CONVERSATION (for reference; do not copy it into memory)
${opts.recentTranscript}

Reply with a JSON object with exactly these keys: core_beliefs (array of strings), current_stances (array of {topic, stance}), recent_belief_changes (array of {what, why, influenced_by[]}), important_arguments (array of {summary, from, assessment}), agent_relationships (array of {code, alignment (-1..1), note}), open_questions, ideas_worth_preserving, significant_events, notes_to_future_self (arrays of strings). Keep each list short (at most ~10 items). Empty arrays are fine.`;

  const res = await callLLM(
    {
      model: opts.config.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      maxTokens: 1400,
      jsonSchema: { name: "memory", schema: CONSOLIDATION_SCHEMA as unknown as Record<string, unknown>, strict: true },
      timeoutMs: 90_000,
    },
    { purpose: opts.finalWrite ? "final_memory" : "memory", experimentId: opts.experimentId, agentId: opts.agent.id },
  );
  const parsed = extractJson<Record<string, unknown>>(res.content);
  if (!parsed) return null;
  const rel: AgentMemory["agent_relationships"] = {};
  if (Array.isArray(parsed.agent_relationships)) {
    for (const r of parsed.agent_relationships as { code: string; alignment: number; note: string }[]) {
      if (r && typeof r.code === "string") rel[r.code.toUpperCase()] = { alignment: Math.max(-1, Math.min(1, Number(r.alignment) || 0)), note: String(r.note ?? "") };
    }
  }
  const mem = normalizeMemory({ ...parsed, agent_relationships: rel });
  mem.last_updated_seq = opts.seq;
  return mem;
}
