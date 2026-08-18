import "server-only";
import { GrokProvider, GROK_MODELS } from "./grok";
import { LLMError, type ChatRequest, type ChatResponse, type LLMProvider, type ModelInfo } from "./provider";
import { supabaseAdmin } from "@/lib/supabase/server";

let provider: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (provider) return provider;
  // Single provider for v1. Add a switch on process.env.LLM_PROVIDER to extend.
  provider = new GrokProvider();
  return provider;
}

export function availableModels(): ModelInfo[] {
  return GROK_MODELS;
}

export function defaultModel(): string {
  return process.env.XAI_DEFAULT_MODEL || "grok-4.3";
}

export type CallPurpose = "turn" | "memory" | "final_memory" | "judge" | "tagger" | "test";

export interface CallMeta {
  purpose: CallPurpose;
  experimentId?: string | null;
  agentId?: string | null;
}

/**
 * Central entry point: calls the provider and records usage/cost in llm_calls
 * and on the experiment row. Errors are logged then re-thrown.
 */
export async function callLLM(req: ChatRequest, meta: CallMeta): Promise<ChatResponse> {
  const p = getProvider();
  const db = supabaseAdmin();
  const started = Date.now();
  try {
    const res = await p.chat(req);
    void db
      .from("llm_calls")
      .insert({
        experiment_id: meta.experimentId ?? null,
        agent_id: meta.agentId ?? null,
        purpose: meta.purpose,
        provider: p.name,
        model: res.model,
        prompt_tokens: res.usage.promptTokens,
        completion_tokens: res.usage.completionTokens,
        reasoning_tokens: res.usage.reasoningTokens,
        cached_tokens: res.usage.cachedTokens,
        cost_usd: res.usage.costUsd,
        latency_ms: res.latencyMs,
        status: "ok",
      })
      .then(({ error }) => {
        if (error) console.error("llm_calls insert failed", error.message);
      });
    if (meta.experimentId) {
      void db
        .rpc("add_experiment_usage", {
          p_experiment_id: meta.experimentId,
          p_prompt: res.usage.promptTokens,
          p_completion: res.usage.completionTokens + res.usage.reasoningTokens,
          p_cost: res.usage.costUsd,
        })
        .then(({ error }) => {
          if (error) console.error("add_experiment_usage failed", error.message);
        });
    }
    return res;
  } catch (e) {
    const err = e as Error;
    const kind = e instanceof LLMError ? e.kind : "provider";
    const status = kind === "rate_limited" ? "rate_limited" : kind === "timeout" ? "timeout" : "error";
    await db.from("llm_calls").insert({
      experiment_id: meta.experimentId ?? null,
      agent_id: meta.agentId ?? null,
      purpose: meta.purpose,
      provider: p.name,
      model: req.model,
      latency_ms: Date.now() - started,
      status,
      error: (err?.message ?? String(e)).slice(0, 1000),
    });
    throw e;
  }
}

export { LLMError };
export type { ChatRequest, ChatResponse, ModelInfo };
