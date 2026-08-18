/**
 * End-to-end orchestrator test in TEST MODE (3 agents, tiny limits).
 * Creates + starts an experiment, runs N ticks directly (no HTTP), prints the
 * transcript, judge output and events, then pauses the experiment.
 * Usage: npm run test:orchestrator -- --ticks 3
 */
import "./_env";
import { createExperiment, startExperiment, pauseExperiment, getExperiment } from "@/lib/experiment/service";
import { testModeConfig } from "@/lib/config/experiment";
import { runTick } from "@/lib/orchestrator/tick";
import { supabaseAdmin } from "@/lib/supabase/server";

const args = process.argv.slice(2);
const ticksArg = args.indexOf("--ticks");
const ticks = ticksArg >= 0 ? Number(args[ticksArg + 1]) : 3;
const keepRunning = args.includes("--keep-running");

async function main() {
  const db = supabaseAdmin();
  const cfg = testModeConfig({ messages_per_minute: 30, agent_cooldown_seconds: 3, judge_every_n_messages: 4, tag_every_n_messages: 3, max_messages: 12 });
  const exp = await createExperiment({ title: "orchestrator smoke test", config: cfg });
  console.log(`created experiment #${exp.number} ${exp.id}`);
  await startExperiment(exp.id);
  console.log("started");

  for (let i = 0; i < ticks; i++) {
    const r = await runTick({ timeBudgetMs: 55_000, source: "test" });
    console.log(`tick ${i + 1}:`, JSON.stringify({ ...r, turns: r.turns.map((t) => `${t.agent}${t.spoke ? "+" : "-"}${t.error ? "!" + t.error : ""}`) }));
  }

  const { data: msgs } = await db.from("messages").select("seq, kind, agent_code, agent_name, addressed_agent_numbers, seed_relevance, seed_stance, content").eq("experiment_id", exp.id).order("seq");
  console.log("\n=== TRANSCRIPT ===");
  for (const m of msgs ?? []) {
    console.log(`#${m.seq} [${m.kind === "system" ? "SYSTEM" : `${m.agent_code} / ${m.agent_name}`}${m.addressed_agent_numbers?.length ? " -> " + m.addressed_agent_numbers.join(",") : ""}] rel=${m.seed_relevance ?? "?"} st=${m.seed_stance ?? "?"}\n   ${m.content}\n`);
  }
  const { data: turns } = await db.from("agent_turns").select("agent_number, spoke, pass_reason, memory_updated, scheduler_score").eq("experiment_id", exp.id).order("created_at");
  console.log("=== TURNS ===");
  for (const t of turns ?? []) console.log(`A${String(t.agent_number).padStart(2, "0")} spoke=${t.spoke} mem=${t.memory_updated} score=${t.scheduler_score?.toFixed(2)} ${t.pass_reason ?? ""}`);
  const { data: states } = await db.from("belief_states").select("agent_number, exposed, engaged, adoption_score, propagation_score, confidence, stage, reason_summary").eq("experiment_id", exp.id).order("agent_number");
  console.log("=== BELIEF STATES ===");
  for (const s of states ?? []) console.log(JSON.stringify(s));
  const { data: mems } = await db.from("agent_memories").select("agent_number, version, update_kind, memory").eq("experiment_id", exp.id).order("agent_number").order("version");
  console.log("=== MEMORY (latest per agent) ===");
  const latest = new Map<number, NonNullable<typeof mems>[number]>();
  for (const m of mems ?? []) latest.set(m.agent_number, m);
  for (const [, m] of latest) console.log(`A${String(m.agent_number).padStart(2, "0")} v${m.version} (${m.update_kind}):`, JSON.stringify(m.memory).slice(0, 600));
  const { data: events } = await db.from("experiment_events").select("kind, message, created_at").eq("experiment_id", exp.id).order("created_at");
  console.log("=== EVENTS ===");
  for (const e of events ?? []) console.log(`[${e.created_at.slice(11, 19)}] ${e.message}`);
  const fresh = await getExperiment(exp.id);
  console.log(`\nusage: calls=${fresh?.total_llm_calls} prompt=${fresh?.total_prompt_tokens} completion=${fresh?.total_completion_tokens} cost=$${Number(fresh?.total_cost_usd).toFixed(4)} status=${fresh?.status} phase=${fresh?.phase}`);
  if (!keepRunning && fresh?.status === "running") {
    await pauseExperiment(exp.id);
    console.log("paused");
  }
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
