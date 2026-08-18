/**
 * Generic model interface. The rest of the app only talks to this.
 * Swap providers by implementing LLMProvider and registering it in index.ts.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Force a JSON object matching this schema (provider-native structured output). */
  jsonSchema?: JsonSchemaSpec;
  /** Force any JSON object (weaker than jsonSchema). */
  jsonMode?: boolean;
  timeoutMs?: number;
  /** Optional provider-specific reasoning effort hint. */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  /** Exact cost when the provider reports it; else estimated from registry. */
  costUsd: number;
  costIsEstimate: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: ChatUsage;
  latencyMs: number;
  finishReason: string | null;
}

export interface ModelInfo {
  id: string;
  label: string;
  inputPerMTok: number; // USD
  outputPerMTok: number; // USD
  cachedInputPerMTok?: number;
  reasoning: boolean;
  notes?: string;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  models(): ModelInfo[];
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind: "rate_limited" | "timeout" | "provider" | "network" | "bad_request",
    public readonly status?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
