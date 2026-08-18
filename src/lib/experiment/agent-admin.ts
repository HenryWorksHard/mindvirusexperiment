import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseConfig } from "@/lib/config/experiment";
import { emptyMemory } from "@/lib/types";
import { logEvent } from "./events";
import { runAgentTurn } from "@/lib/orchestrator/turn";
import { loadCurrentMemory, saveMemory } from "@/lib/orchestrator/memory";

async function loadAgent(agentId: string) {
  const db = supabaseAdmin();
  const { data: agent } = await db.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) throw new Error("Agent not found");
  const { data: exp } = await db.from("experiments").select("*").eq("id", agent.experiment_id).single();
  if (!exp) throw new Error("Experiment not found");
  return { agent, exp };
}

export async function setAgentEnabled(agentId: string, enabled: boolean) {
  const db = supabaseAdmin();
  const { agent, exp } = await loadAgent(agentId);
  if (agent.is_seed && !enabled) throw new Error("The seed agent cannot be disabled. Choose a different seed in a new draft instead.");
  await db.from("agents").update({ enabled, status: enabled ? "idle" : "disabled" }).eq("id", agentId);
  await logEvent({
    experimentId: exp.id,
    kind: enabled ? "AGENT_ENABLED" : "AGENT_DISABLED",
    agentNumber: agent.number,
    message: `${agent.code} ${enabled ? "ENABLED" : "DISABLED"} BY ADMIN`,
    messageSeqAt: exp.message_count,
  });
}

/** Wipe conversational context (messages before now are no longer shown to this agent). Memory persists. */
export async function clearAgentContext(agentId: string) {
  const db = supabaseAdmin();
  const { agent, exp } = await loadAgent(agentId);
  await db
    .from("agents")
    .update({ context_epoch: agent.context_epoch + 1, context_cleared_at: new Date().toISOString() })
    .eq("id", agentId);
  await logEvent({
    experimentId: exp.id,
    kind: "AGENT_CONTEXT_CLEARED",
    agentNumber: agent.number,
    message: `${agent.code} CONTEXT WIPED (EPOCH ${agent.context_epoch + 1}); MEMORY PRESERVED`,
    messageSeqAt: exp.message_count,
  });
}

/** Erase persistent memory (new empty version). */
export async function clearAgentMemory(agentId: string) {
  const { agent, exp } = await loadAgent(agentId);
  const cur = await loadCurrentMemory(agentId);
  await saveMemory({
    experimentId: exp.id,
    agentId,
    agentNumber: agent.number,
    memory: emptyMemory(),
    previousVersion: cur.version,
    kind: "admin_clear",
    seq: exp.message_count,
  });
  await logEvent({
    experimentId: exp.id,
    kind: "AGENT_MEMORY_CLEARED",
    agentNumber: agent.number,
    message: `${agent.code} PERSISTENT MEMORY CLEARED BY ADMIN`,
    messageSeqAt: exp.message_count,
  });
}

/** Force one turn for an agent now (bypasses scheduler; respects nothing else). */
export async function triggerAgentTurn(agentId: string) {
  const db = supabaseAdmin();
  const { agent, exp } = await loadAgent(agentId);
  if (exp.status !== "running" && exp.status !== "paused") throw new Error("Experiment must be running or paused to trigger a turn.");
  if (!agent.enabled) throw new Error("Agent is disabled.");
  const cfg = parseConfig(exp.config);
  const { data: roster } = await db.from("agents").select("*").eq("experiment_id", exp.id).eq("enabled", true).order("number");
  await logEvent({ experimentId: exp.id, kind: "MANUAL_TURN", agentNumber: agent.number, message: `${agent.code} TURN TRIGGERED BY ADMIN`, messageSeqAt: exp.message_count });
  const res = await runAgentTurn({ experiment: exp, agent, config: cfg, roster: roster ?? [agent], trigger: "manual" });
  if (res.spoke && res.message) {
    await db.from("experiments").update({ last_agent_message_at: res.message.created_at }).eq("id", exp.id);
  }
  return { spoke: res.spoke, message: res.message?.content ?? null, passReason: res.passReason ?? null, error: res.error ?? null };
}

export async function getAgentPrompt(agentId: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("agent_prompts").select("*").eq("agent_id", agentId).maybeSingle();
  return data ?? null;
}
