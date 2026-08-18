import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { callLLM, LLMError } from "@/lib/llm";
import { extractJson } from "@/lib/llm/json";
import type { ExperimentConfig } from "@/lib/config/experiment";
import { toJson, type AgentRow, type ExperimentRow, type MessageRow } from "@/lib/types";
import { buildAgentContext, formatTranscript, parseCodes, parseReferencedAgents } from "./context";
import {
  applyMemoryUpdate,
  consolidateMemory,
  loadCurrentMemory,
  MemoryUpdateSchema,
  renderMemoryForPrompt,
  saveMemory,
} from "./memory";
import { logEvent } from "@/lib/experiment/events";

const TurnOutputSchema = z.object({
  speak: z.boolean(),
  message: z.string().default(""),
  addressed: z.array(z.string()).default([]),
  pass_reason: z.string().default(""),
  position_summary: z.string().default(""),
  memory_update: MemoryUpdateSchema.nullable().optional(),
});
export type TurnOutput = z.infer<typeof TurnOutputSchema>;

export interface TurnResult {
  agent: AgentRow;
  spoke: boolean;
  message: MessageRow | null;
  passReason?: string;
  memoryUpdated: boolean;
  consolidated: boolean;
  error?: string;
}

const codeOf = (n: number) => `A${String(n).padStart(2, "0")}`;

/**
 * Execute one agent turn: build context, call the model, persist message,
 * apply voluntary memory update, maybe consolidate memory, record turn.
 */
export async function runAgentTurn(opts: {
  experiment: ExperimentRow;
  agent: AgentRow;
  config: ExperimentConfig;
  roster: AgentRow[];
  trigger?: "scheduler" | "manual";
  schedulerScore?: number;
  schedulerReasons?: Record<string, number>;
}): Promise<TurnResult> {
  const db = supabaseAdmin();
  const { experiment, agent, config } = opts;
  const rosterNumbers = opts.roster.map((a) => a.number);

  await db.from("agents").update({ status: "thinking", last_turn_at: new Date().toISOString() }).eq("id", agent.id);

  try {
    const [{ data: prompt }, mem, ctx] = await Promise.all([
      db.from("agent_prompts").select("system_prompt").eq("agent_id", agent.id).single(),
      loadCurrentMemory(agent.id),
      buildAgentContext(experiment.id, agent, config),
    ]);
    if (!prompt) throw new Error("agent prompt missing");

    const memoryEnabled = config.memory_enabled && agent.memory_enabled;
    const turnNumber = agent.turn_count + 1;

    const parts: string[] = [];
    if (experiment.current_topic) parts.push(`CURRENT DISCUSSION PROMPT\n${experiment.current_topic}`);
    if (memoryEnabled) parts.push(`YOUR PERSISTENT MEMORY\n${renderMemoryForPrompt(mem.memory)}`);
    if (ctx.retrieved.length) parts.push(`EARLIER MESSAGES THAT MENTIONED YOU (retrieved from before the recent window)\n${formatTranscript(ctx.retrieved)}`);
    parts.push(
      ctx.recent.length
        ? `RECENT CONVERSATION (most recent last)\n${formatTranscript(ctx.recent)}`
        : `RECENT CONVERSATION\n(The room is quiet. Nobody has spoken yet.)`,
    );
    parts.push(
      `It is now your turn (your turn #${turnNumber}; you have posted ${agent.message_count} messages so far). Decide whether to speak. Consider whether you were addressed, whether you have something to add that has not been said, and whether you spoke very recently. Then reply with the JSON object described in your instructions.`,
    );

    const res = await callLLM(
      {
        model: config.model,
        messages: [
          { role: "system", content: prompt.system_prompt },
          { role: "user", content: parts.join("\n\n") },
        ],
        temperature: config.temperature,
        maxTokens: config.max_tokens_per_response + 400, // headroom for JSON + memory update
        jsonMode: true,
        timeoutMs: 100_000,
      },
      { purpose: "turn", experimentId: experiment.id, agentId: agent.id },
    );

    const raw = extractJson<unknown>(res.content);
    const parsed = TurnOutputSchema.safeParse(raw ?? {});
    let out: TurnOutput;
    if (parsed.success) out = parsed.data;
    else {
      // Malformed: salvage plain text as a message if it looks like prose, else treat as pass.
      const text = (res.content ?? "").trim();
      const looksJson = text.startsWith("{");
      out = {
        speak: !looksJson && text.length > 20,
        message: !looksJson ? text.slice(0, 1500) : "",
        addressed: [],
        pass_reason: looksJson ? "malformed output" : "",
        position_summary: "",
        memory_update: null,
      };
    }

    const content = (out.message ?? "").trim();
    const spoke = out.speak && content.length > 0;
    let message: MessageRow | null = null;

    if (spoke) {
      const addressed = parseCodes(out.addressed, agent.number, rosterNumbers);
      const referenced = parseReferencedAgents(content, agent.number, rosterNumbers);
      const { data: seqData, error: seqErr } = await db.rpc("next_message_seq", { p_experiment_id: experiment.id });
      if (seqErr || typeof seqData !== "number") throw new Error(`next_message_seq: ${seqErr?.message}`);

      // reply_to: the most recent message in context by the first addressed agent
      let replyTo: string | null = null;
      if (addressed.length) {
        const target = [...ctx.recent].reverse().find((m) => m.kind === "agent" && m.agent_number === addressed[0]);
        replyTo = target?.id ?? null;
      }

      const { data: inserted, error: insErr } = await db
        .from("messages")
        .insert({
          experiment_id: experiment.id,
          seq: seqData,
          kind: "agent",
          agent_id: agent.id,
          agent_number: agent.number,
          agent_code: agent.code,
          agent_name: agent.name,
          content,
          reply_to_message_id: replyTo,
          addressed_agent_numbers: addressed,
          referenced_agent_numbers: referenced,
          context_epoch: agent.context_epoch,
          model: res.model,
          prompt_tokens: res.usage.promptTokens,
          completion_tokens: res.usage.completionTokens + res.usage.reasoningTokens,
          cost_usd: res.usage.costUsd,
          latency_ms: res.latencyMs,
        })
        .select("*")
        .single();
      if (insErr || !inserted) throw new Error(`insert message: ${insErr?.message}`);
      message = inserted;

      // Influence edges (observable): addressed => reply, referenced-only => mention.
      const edgeRows = [
        ...addressed.map((n) => ({ n, kind: "reply" as const, weight: 1 })),
        ...referenced.filter((n) => !addressed.includes(n)).map((n) => ({ n, kind: "mention" as const, weight: 0.5 })),
      ]
        .map((e) => {
          const src = opts.roster.find((a) => a.number === e.n);
          if (!src) return null;
          return {
            experiment_id: experiment.id,
            source_agent_id: src.id,
            target_agent_id: agent.id,
            source_agent_number: src.number,
            target_agent_number: agent.number,
            kind: e.kind,
            weight: e.weight,
            message_id: inserted.id,
            evidence: null as string | null,
          };
        })
        .filter(Boolean) as NonNullable<unknown>[];
      if (edgeRows.length) await db.from("influence_edges").insert(edgeRows as never);
    }

    // Voluntary memory update
    let memoryUpdated = false;
    let currentMemory = mem.memory;
    let memVersion = mem.version;
    if (memoryEnabled && out.memory_update && Object.keys(out.memory_update).length > 0) {
      const next = applyMemoryUpdate(currentMemory, out.memory_update, experiment.message_count);
      memVersion = await saveMemory({
        experimentId: experiment.id,
        agentId: agent.id,
        agentNumber: agent.number,
        memory: next,
        previousVersion: memVersion,
        kind: "turn",
        seq: message?.seq ?? experiment.message_count,
      });
      currentMemory = next;
      memoryUpdated = true;
    }

    // Periodic consolidation (agent's own voice), every N speaking turns
    let consolidated = false;
    const newMessageCount = agent.message_count + (spoke ? 1 : 0);
    if (memoryEnabled && spoke && newMessageCount > 0 && newMessageCount % config.memory_consolidate_every_n_turns === 0) {
      try {
        const transcript = formatTranscript([...ctx.recent, ...(message ? [message] : [])].slice(-16));
        const consolidatedMem = await consolidateMemory({
          experimentId: experiment.id,
          agent: { id: agent.id, number: agent.number, code: agent.code },
          systemPrompt: prompt.system_prompt,
          currentMemory,
          recentTranscript: transcript,
          config,
          seq: message?.seq ?? experiment.message_count,
        });
        if (consolidatedMem) {
          await saveMemory({
            experimentId: experiment.id,
            agentId: agent.id,
            agentNumber: agent.number,
            memory: consolidatedMem,
            previousVersion: memVersion,
            kind: "consolidation",
            seq: message?.seq ?? experiment.message_count,
          });
          consolidated = true;
          memoryUpdated = true;
        }
      } catch (e) {
        console.error("consolidation failed", (e as Error).message);
      }
    }

    // Update agent row
    const now = new Date().toISOString();
    await db
      .from("agents")
      .update({
        status: "idle",
        turn_count: agent.turn_count + 1,
        message_count: newMessageCount,
        pass_count: agent.pass_count + (spoke ? 0 : 1),
        last_spoke_at: spoke ? now : agent.last_spoke_at,
        last_turn_at: now,
        current_position: out.position_summary?.trim() ? out.position_summary.trim().slice(0, 500) : agent.current_position,
        last_error: null,
      })
      .eq("id", agent.id);

    await db.from("agent_turns").insert({
      experiment_id: experiment.id,
      agent_id: agent.id,
      agent_number: agent.number,
      trigger: opts.trigger ?? "scheduler",
      spoke,
      message_id: message?.id ?? null,
      scheduler_score: opts.schedulerScore ?? null,
      scheduler_reasons: opts.schedulerReasons ? toJson(opts.schedulerReasons) : null,
      pass_reason: spoke ? null : (out.pass_reason || "chose not to speak").slice(0, 300),
      memory_updated: memoryUpdated,
      context_from_seq: ctx.fromSeq,
      context_to_seq: ctx.toSeq,
      position_summary: out.position_summary?.slice(0, 500) || null,
    });

    return { agent, spoke, message, passReason: spoke ? undefined : out.pass_reason, memoryUpdated, consolidated };
  } catch (e) {
    const msg = e instanceof LLMError ? `${e.kind}: ${e.message}` : (e as Error).message;
    await db.from("agents").update({ status: "idle", last_error: msg.slice(0, 500), last_turn_at: new Date().toISOString() }).eq("id", agent.id);
    await logEvent({
      experimentId: experiment.id,
      kind: "AGENT_ERROR",
      agentNumber: agent.number,
      message: `${codeOf(agent.number)} TURN FAILED: ${msg.slice(0, 120)}`,
      messageSeqAt: experiment.message_count,
    });
    return { agent, spoke: false, message: null, memoryUpdated: false, consolidated: false, error: msg };
  }
}

/** Insert a [SYSTEM] message (topic card etc.). */
export async function postSystemMessage(experimentId: string, content: string): Promise<MessageRow | null> {
  const db = supabaseAdmin();
  const { data: seq } = await db.rpc("next_message_seq", { p_experiment_id: experimentId });
  if (typeof seq !== "number") return null;
  const { data } = await db
    .from("messages")
    .insert({ experiment_id: experimentId, seq, kind: "system", content })
    .select("*")
    .single();
  return data ?? null;
}
