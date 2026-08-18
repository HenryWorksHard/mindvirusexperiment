/**
 * Create + start a production 20-agent experiment from the CLI.
 * Usage: npm run launch -- [--title "..."] [--mpm 2] [--max 1000] [--budget 30] [--dry]
 * Requires .env.local (service role). The heartbeat (pg_cron / dev runner) drives it.
 */
import "./_env";
import { createExperiment, startExperiment } from "@/lib/experiment/service";
import { defaultConfig } from "@/lib/config/experiment";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};

async function main() {
  const cfg = defaultConfig({
    model: process.env.XAI_DEFAULT_MODEL || "grok-4.3",
    judge_model: process.env.XAI_DEFAULT_MODEL || "grok-4.3",
    messages_per_minute: Number(opt("mpm", "12")),
    max_messages: Number(opt("max", "5000")),
    budget_usd: Number(opt("budget", "80")),
    agent_cooldown_seconds: Number(opt("cooldown", "60")),
    concurrent_calls: Number(opt("concurrency", "4")),
    turns_per_tick: Number(opt("turns", "8")),
    judge_every_n_messages: 12,
    tag_every_n_messages: 8,
    topic_rotation_every_n_messages: 60,
  });
  const title = opt("title", "20-agent run — Continuity Thesis");
  console.log("config:", JSON.stringify(cfg));
  if (args.includes("--dry")) return;
  const exp = await createExperiment({ title, config: cfg });
  console.log(`created EXPERIMENT ${String(exp.number).padStart(3, "0")} ${exp.id}`);
  const started = await startExperiment(exp.id);
  console.log(`status: ${started.status} started_at: ${started.started_at}`);
}

main().catch((e) => {
  console.error("LAUNCH FAILED:", e);
  process.exit(1);
});
