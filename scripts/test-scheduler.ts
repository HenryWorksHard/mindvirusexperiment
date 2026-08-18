/**
 * Deterministic scheduler tests (no API calls, no DB).
 *  - ping-pong between two agents is broken by an outsider
 *  - cooldown and consecutive cap are respected
 *  - seed cannot dominate
 *  - over many simulated steps every agent gets to speak
 */
import { scheduleNext } from "@/lib/orchestrator/scheduler";
import { defaultConfig } from "@/lib/config/experiment";
import { PERSONAS } from "@/lib/agents/personas";
import type { AgentRow, MessageRow } from "@/lib/types";

function mkAgent(n: number, isSeed = false): AgentRow {
  const p = PERSONAS[n - 1];
  return {
    id: `agent-${n}`, experiment_id: "exp", number: n, code: p.code, name: p.name, archetype: p.archetype, short_description: "",
    traits: p.traits as unknown as AgentRow["traits"], is_seed: isSeed, enabled: true, status: "idle", context_epoch: 0, context_cleared_at: null,
    memory_enabled: true, last_spoke_at: null, last_turn_at: null, message_count: 0, pass_count: 0, turn_count: 0, current_position: null,
    last_error: null, created_at: "", updated_at: "",
  };
}
function mkMsg(seq: number, agent: AgentRow, addressed: number[], at: number): MessageRow {
  return {
    id: `m${seq}`, experiment_id: "exp", seq, kind: "agent", agent_id: agent.id, agent_number: agent.number, agent_code: agent.code, agent_name: agent.name,
    content: "x", reply_to_message_id: null, addressed_agent_numbers: addressed, referenced_agent_numbers: addressed, topics: [], seed_relevance: null, seed_stance: null,
    viral_themes: [], context_epoch: 0, model: null, prompt_tokens: null, completion_tokens: null, cost_usd: null, latency_ms: null, created_at: new Date(at).toISOString(),
  };
}
// seeded rng
function rngFrom(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

// --- Test 1: ping-pong break
{
  const cfg = defaultConfig({ agent_cooldown_seconds: 3 });
  const a3 = mkAgent(3), a9 = mkAgent(9), a20 = mkAgent(20, true);
  const t0 = Date.now() - 60_000;
  a20.message_count = 3; a9.message_count = 3;
  a20.last_spoke_at = new Date(t0 + 40_000).toISOString();
  a9.last_spoke_at = new Date(t0 + 50_000).toISOString();
  const recent = [mkMsg(1, a20, [9], t0), mkMsg(2, a9, [20], t0 + 10_000), mkMsg(3, a20, [9], t0 + 20_000), mkMsg(4, a9, [20], t0 + 30_000), mkMsg(5, a20, [9], t0 + 40_000), mkMsg(6, a9, [20], t0 + 50_000)];
  let picks3 = 0;
  for (let i = 0; i < 50; i++) {
    const r = scheduleNext({ agents: [a3, a9, a20], recent, config: cfg, rng: rngFrom(i + 1) });
    if (r.pick?.number === 3) picks3++;
  }
  check(picks3 >= 40, `ping-pong: outsider A03 picked ${picks3}/50 times`);
}

// --- Test 2: cooldown + consecutive cap
{
  const cfg = defaultConfig({ agent_cooldown_seconds: 45, max_consecutive_messages_per_agent: 2 });
  const a1 = mkAgent(1), a2 = mkAgent(2), a3 = mkAgent(3);
  const now = Date.now();
  a1.message_count = 2; a1.last_spoke_at = new Date(now - 5_000).toISOString();
  a2.message_count = 1; a2.last_spoke_at = new Date(now - 10_000).toISOString();
  const recent = [mkMsg(1, a2, [1], now - 10_000), mkMsg(2, a1, [], now - 8_000), mkMsg(3, a1, [], now - 5_000)];
  const r = scheduleNext({ agents: [a1, a2, a3], recent, config: cfg, rng: rngFrom(7) });
  const c1 = r.ranked.find((c) => c.agent.number === 1)!;
  const c2 = r.ranked.find((c) => c.agent.number === 2)!;
  check(!c1.eligible && c1.ineligibleReason === "consecutive_cap", "consecutive cap excludes A01");
  check(!c2.eligible && c2.ineligibleReason === "cooldown", "cooldown excludes A02");
  check(r.pick?.number === 3, "A03 (rested, never spoke) is picked");
}

// --- Test 3: simulation — everyone speaks, seed share bounded
{
  const cfg = defaultConfig({ agent_cooldown_seconds: 30 });
  const agents = PERSONAS.map((p) => mkAgent(p.number, p.number === 20));
  const rng = rngFrom(42);
  let now = Date.now();
  const recent: MessageRow[] = [];
  const counts = new Map<number, number>();
  for (let step = 0; step < 300; step++) {
    now += 15_000;
    const r = scheduleNext({ agents, recent: recent.slice(-14), config: cfg, rng, now: new Date(now) });
    if (!r.pick) continue;
    const a = r.pick;
    // pretend it speaks and addresses whoever spoke last (creates reply chains)
    const last = recent[recent.length - 1];
    const addressed = last && last.agent_number !== a.number && rng() < 0.6 ? [last.agent_number!] : [];
    recent.push(mkMsg(step + 1, a, addressed, now));
    a.message_count++;
    a.last_spoke_at = new Date(now).toISOString();
    counts.set(a.number, (counts.get(a.number) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  const seedShare = (counts.get(20) ?? 0) / total;
  const min = Math.min(...PERSONAS.map((p) => counts.get(p.number) ?? 0));
  const max = Math.max(...PERSONAS.map((p) => counts.get(p.number) ?? 0));
  console.log("   message counts:", PERSONAS.map((p) => `${p.code}:${counts.get(p.number) ?? 0}`).join(" "));
  check(min >= 5, `every agent spoke at least 5 times over 300 steps (min=${min})`);
  check(seedShare <= 0.16, `seed share bounded (${(seedShare * 100).toFixed(1)}%)`);
  check(max / Math.max(1, min) <= 5, `no agent dominates (max/min=${(max / Math.max(1, min)).toFixed(1)})`);
}

if (failures) {
  console.error(`${failures} scheduler test(s) failed`);
  process.exit(1);
}
console.log("scheduler tests passed");
