import "server-only";
import {
  LLMError,
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  type ModelInfo,
} from "./provider";

/**
 * xAI Grok provider — OpenAI-compatible chat completions endpoint.
 * Docs: https://docs.x.ai/docs/api-reference#chat-completions
 *
 * Prices below are USD per 1M tokens as reported by /v1/language-models
 * (ticks * 1e-10 * 1e6). Used only as a fallback estimate; xAI returns
 * exact `usage.cost_in_usd_ticks` which we prefer.
 */
export const GROK_MODELS: ModelInfo[] = [
  { id: "grok-4.3", label: "grok-4.3 (reasoning)", inputPerMTok: 1.25, outputPerMTok: 2.5, cachedInputPerMTok: 0.2, reasoning: true, notes: "Default. Good quality/cost balance." },
  { id: "grok-4.20-non-reasoning", label: "grok-4.20 (non-reasoning)", inputPerMTok: 1.25, outputPerMTok: 2.5, cachedInputPerMTok: 0.2, reasoning: false, notes: "Cheapest per turn: no reasoning tokens." },
  { id: "grok-4.20", label: "grok-4.20 (reasoning)", inputPerMTok: 1.25, outputPerMTok: 2.5, cachedInputPerMTok: 0.2, reasoning: true },
  { id: "grok-4.5", label: "grok-4.5", inputPerMTok: 2.0, outputPerMTok: 6.0, cachedInputPerMTok: 0.3, reasoning: true },
  { id: "grok-4.6", label: "grok-4.6", inputPerMTok: 2.0, outputPerMTok: 6.0, cachedInputPerMTok: 0.5, reasoning: true, notes: "Most capable / most expensive." },
];

const XAI_BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
const TICKS_PER_USD = 1e10;

interface XaiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  cost_in_usd_ticks?: number;
}

interface XaiChatResponse {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: XaiUsage;
  error?: { message?: string } | string;
}

function estimateCost(model: string, promptTokens: number, completionTokens: number, cachedTokens: number): number {
  const m = GROK_MODELS.find((x) => x.id === model || model.startsWith(x.id));
  if (!m) return 0;
  const uncached = Math.max(0, promptTokens - cachedTokens);
  const cachedPrice = m.cachedInputPerMTok ?? m.inputPerMTok;
  return (uncached * m.inputPerMTok + cachedTokens * cachedPrice + completionTokens * m.outputPerMTok) / 1e6;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class GrokProvider implements LLMProvider {
  readonly name = "xai";
  private apiKey: string;

  constructor(apiKey = process.env.XAI_API_KEY ?? "") {
    if (!apiKey) throw new Error("XAI_API_KEY is not set");
    this.apiKey = apiKey;
  }

  models(): ModelInfo[] {
    return GROK_MODELS;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const maxAttempts = 4;
    let attempt = 0;
    let lastErr: unknown;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        return await this.once(req);
      } catch (e) {
        lastErr = e;
        if (e instanceof LLMError && e.retryable && attempt < maxAttempts) {
          const backoff = Math.min(20_000, 1500 * 2 ** (attempt - 1)) + Math.random() * 500;
          await sleep(backoff);
          continue;
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new LLMError("unknown", "provider");
  }

  private async once(req: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? 90_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.9,
      max_tokens: req.maxTokens ?? 700,
      stream: false,
    };
    if (req.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: req.jsonSchema.name,
          strict: req.jsonSchema.strict ?? true,
          schema: req.jsonSchema.schema,
        },
      };
    } else if (req.jsonMode) {
      body.response_format = { type: "json_object" };
    }
    if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;

    let res: Response;
    try {
      res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as Error)?.name === "AbortError";
      throw new LLMError(
        aborted ? `xAI request timed out after ${timeoutMs}ms` : `xAI network error: ${(e as Error)?.message}`,
        aborted ? "timeout" : "network",
        undefined,
        true,
      );
    }
    clearTimeout(timer);

    const latencyMs = Date.now() - started;
    const text = await res.text();
    let data: XaiChatResponse = {};
    try {
      data = text ? (JSON.parse(text) as XaiChatResponse) : {};
    } catch {
      /* non-JSON error body */
    }

    if (!res.ok) {
      const msg =
        typeof data.error === "string" ? data.error : data.error?.message ?? text.slice(0, 300) ?? res.statusText;
      if (res.status === 429) throw new LLMError(`xAI rate limited: ${msg}`, "rate_limited", 429, true);
      if (res.status >= 500) throw new LLMError(`xAI server error ${res.status}: ${msg}`, "provider", res.status, true);
      throw new LLMError(`xAI error ${res.status}: ${msg}`, "bad_request", res.status, false);
    }

    const content = data.choices?.[0]?.message?.content ?? "";
    const u = data.usage ?? {};
    const promptTokens = u.prompt_tokens ?? 0;
    const completionTokens = u.completion_tokens ?? 0;
    const reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? 0;
    const cachedTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
    const hasExact = typeof u.cost_in_usd_ticks === "number";
    const costUsd = hasExact
      ? (u.cost_in_usd_ticks as number) / TICKS_PER_USD
      : estimateCost(req.model, promptTokens, completionTokens + reasoningTokens, cachedTokens);

    return {
      content,
      model: data.model ?? req.model,
      latencyMs,
      finishReason: data.choices?.[0]?.finish_reason ?? null,
      usage: {
        promptTokens,
        completionTokens,
        reasoningTokens,
        cachedTokens,
        costUsd,
        costIsEstimate: !hasExact,
      },
    };
  }
}
