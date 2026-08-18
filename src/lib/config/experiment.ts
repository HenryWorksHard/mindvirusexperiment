import { z } from "zod";

/**
 * Per-experiment configuration, stored in experiments.config (jsonb).
 * All limits are configurable from the admin panel; defaults below.
 */
export const ExperimentConfigSchema = z.object({
  // Models
  model: z.string().min(1).default("grok-4.3"),
  judge_model: z.string().min(1).default("grok-4.3"),
  temperature: z.number().min(0).max(2).default(0.9),
  max_tokens_per_response: z.number().int().min(64).max(4000).default(700),

  // Pace / cost limits
  messages_per_minute: z.number().min(0.2).max(30).default(4),
  max_messages: z.number().int().min(1).max(5000).default(400),
  budget_usd: z.number().min(0.1).max(1000).default(15),
  agent_cooldown_seconds: z.number().int().min(0).max(3600).default(45),
  concurrent_calls: z.number().int().min(1).max(4).default(1),
  turns_per_tick: z.number().int().min(1).max(6).default(2),

  // Context management
  context_window_messages: z.number().int().min(4).max(80).default(24),
  retrieved_mentions: z.number().int().min(0).max(12).default(4),

  // Memory
  memory_enabled: z.boolean().default(true),
  memory_consolidate_every_n_turns: z.number().int().min(1).max(50).default(4),
  final_memory_write: z.boolean().default(true),

  // Evaluation
  judge_every_n_messages: z.number().int().min(1).max(100).default(8),
  tag_every_n_messages: z.number().int().min(1).max(100).default(6),

  // Conversation structure
  topic_rotation_every_n_messages: z.number().int().min(0).max(500).default(35),
  max_consecutive_messages_per_agent: z.number().int().min(1).max(5).default(2),

  // Population
  agent_numbers: z.array(z.number().int().min(1).max(20)).min(2).max(20).default(
    Array.from({ length: 20 }, (_, i) => i + 1),
  ),
  seed_agent_number: z.number().int().min(1).max(20).default(20),
  test_mode: z.boolean().default(false),
});

export type ExperimentConfig = z.infer<typeof ExperimentConfigSchema>;

export function defaultConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return ExperimentConfigSchema.parse({ ...overrides });
}

/** Cheap preset for development. 3 agents, slow, small. */
export function testModeConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return ExperimentConfigSchema.parse({
    agent_numbers: [3, 9, 20],
    seed_agent_number: 20,
    max_messages: 20,
    budget_usd: 1,
    messages_per_minute: 3,
    max_tokens_per_response: 350,
    context_window_messages: 12,
    judge_every_n_messages: 5,
    tag_every_n_messages: 5,
    memory_consolidate_every_n_turns: 3,
    topic_rotation_every_n_messages: 8,
    agent_cooldown_seconds: 10,
    test_mode: true,
    ...overrides,
  });
}

export function parseConfig(raw: unknown): ExperimentConfig {
  const res = ExperimentConfigSchema.safeParse(raw ?? {});
  if (res.success) return res.data;
  // Fall back to defaults merged with whatever is valid
  return ExperimentConfigSchema.parse({});
}

export function isTestModeEnv(): boolean {
  return (process.env.TEST_MODE ?? "").toLowerCase() === "true";
}
