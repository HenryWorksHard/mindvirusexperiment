import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseConfig } from "@/lib/config/experiment";
import type { AgentRow, ExperimentRow } from "@/lib/types";
import { scheduleNext } from "./scheduler";
import { postSystemMessage, runAgentTurn } from "./turn";
import { runJudgeRound, tagUntaggedMessages } from "./analysis";
import { consolidateMemory, loadCurrentMemory, saveMemory } from "./memory";
import { formatTranscript } from "./context";
import { logEvent } from "@/lib/experiment/events";
import { stopExperiment } from "@/lib/experiment/service";
import { topicAt } from "@/lib/agents/topics";

const LEASE_KEY = "runner";

export interface TickReport {
  ok: boolean;
  skipped?: string;
  experiment?: string;
  turns: { agent: string; spoke: boolean; error?: string; passReason?: string }[];
  tagged: number;
  judged: number;
  finalMemoryWrites: number;
  completed?: string;
  ms: number;
  notes: string[];
}

/**
 * One runner tick. Idempotent, lease-guarded, time-boxed.
 * Called by pg_cron heartbeat in prod and by scripts/runner.ts in dev.
 */
export async function runTick(opts: { timeBudgetMs?: number; source?: string } = {}): Promise<TickReport> {
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? 48_000;
  const deadline = started + budget;
  const db = supabaseAdmin();
  const holder = `${opts.source ?? "tick"}:${randomUUID().slice(0, 8)}`;
  const report: TickReport = { ok: true, turns: [], tagged: 0, judged: 0, finalMemoryWrites: 0, ms: 0, notes: [] };

  const { data: acquired, error: leaseErr } = await db.rpc("acquire_runner_lease", {
    p_key: LEASE_KEY,
    p_holder: holder,
    p_ttl_seconds: Math.ceil(budget / 1000) + 15,
  });
  if (leaseErr) {
    report.ok = false;
    report.skipped = `lease error: ${leaseErr.message}`;
    report.ms = Date.now() - started;
    return report;
  }
  if (!acquired) {
    report.skipped = "another runner holds the lease";
    report.ms = Date.now() - started;
    return report;
  }

  try {
    const { data: exp0 } = await db.from("experiments").select("*").eq("status", "running").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!exp0) {
      report.skipped = "no running experiment";
      return report;
    }
    report.experiment = exp0.id;
    let exp: ExperimentRow = exp0;
    const config = parseConfig(exp.config);

    if (exp.phase === "final_memory") {
      await runFinalMemoryPhase(exp, deadline, report);
      return report;
    }

    let turnsThisTick = 0;
    while (turnsThisTick < config.turns_per_tick && Date.now() < deadline - 12_000) {
      // Refresh experiment (status/pace/limits may have changed)
      const { data: fresh } = await db.from("experiments").select("*").eq("id", exp.id).single();
      if (!fresh || fresh.status !== "running") {
        report.notes.push("experiment no longer running");
        break;
      }
      exp = fresh;
      const cfg = parseConfig(exp.config);

      // Limits
      if (exp.message_count >= cfg.max_messages) {
        await beginCompletion(exp, "message limit reached", "MESSAGE_LIMIT_REACHED", cfg.final_memory_write, report);
        break;
      }
      if (Number(exp.total_cost_usd) >= cfg.budget_usd) {
        await beginCompletion(exp, `budget of $${cfg.budget_usd} reached`, "BUDGET_REACHED", cfg.final_memory_write, report);
        break;
      }

      // Agents
      const { data: agents } = await db.from("agents").select("*").eq("experiment_id", exp.id).order("number");
      const active = (agents ?? []).filter((a) => a.enabled);
      if (active.length < 2) {
        report.notes.push("fewer than 2 enabled agents");
        break;
      }

      // Pace: min gap between batches of agent messages
      const batchSize = Math.max(1, Math.min(cfg.concurrent_calls, Math.floor(active.length / 2)));
      const minGapMs = (60_000 / cfg.messages_per_minute) * batchSize;
      if (exp.last_agent_message_at) {
        const since = Date.now() - new Date(exp.last_agent_message_at).getTime();
        if (since < minGapMs) {
          const wait = minGapMs - since;
          if (Date.now() + wait > deadline - 15_000) {
            report.notes.push(`pacing: next slot in ${Math.round(wait / 1000)}s`);
            break;
          }
          await new Promise((r) => setTimeout(r, wait));
        }
      }


      // Periodic analysis first (batched, deadline-bounded) so it is never starved by turns.
      if (exp.message_count - exp.last_tag_seq >= cfg.tag_every_n_messages && Date.now() < deadline - 15_000) {
        try {
          report.tagged += await tagUntaggedMessages(exp, cfg);
          exp = { ...exp, last_tag_seq: exp.message_count };
        } catch (e) {
          report.notes.push(`tagger error: ${(e as Error).message}`);
        }
      }
      if (exp.message_count - exp.last_judge_seq >= cfg.judge_every_n_messages && Date.now() < deadline - 20_000) {
        try {
          await tagUntaggedMessages(exp, cfg);
          const jr = await runJudgeRound(exp, cfg, active as AgentRow[], deadline - 12_000);
          report.judged += jr.evaluated;
          if (jr.complete) exp = { ...exp, last_judge_seq: exp.message_count };
          else report.notes.push("judge round partial (time)");
        } catch (e) {
          report.notes.push(`judge error: ${(e as Error).message}`);
        }
      }
      if (Date.now() >= deadline - 12_000) break;

      // Topic cards
      let topicJustIntroduced = false;
      const agentMsgsSinceTopic = exp.message_count - exp.last_topic_seq;
      if (exp.message_count === 0 || (cfg.topic_rotation_every_n_messages > 0 && agentMsgsSinceTopic >= cfg.topic_rotation_every_n_messages + 1)) {
        const topic = topicAt(exp.topic_index);
        const text = `Discussion prompt ${exp.topic_index + 1}: ${topic.title} — ${topic.prompt}`;
        const sys = await postSystemMessage(exp.id, text);
        if (sys) {
          await db.from("experiments").update({ current_topic: `${topic.title} — ${topic.prompt}`, topic_index: exp.topic_index + 1, last_topic_seq: sys.seq }).eq("id", exp.id);
          await logEvent({ experimentId: exp.id, kind: "TOPIC_INTRODUCED", message: `TOPIC: ${topic.title.toUpperCase()}`, messageSeqAt: sys.seq });
          exp = { ...exp, current_topic: `${topic.title} — ${topic.prompt}`, topic_index: exp.topic_index + 1, last_topic_seq: sys.seq, message_count: sys.seq };
          topicJustIntroduced = true;
        }
      }

      const { data: recentDesc } = await db.from("messages").select("*").eq("experiment_id", exp.id).order("seq", { ascending: false }).limit(14);
      const recent = (recentDesc ?? []).slice().reverse();

      const sched = scheduleNext({ agents: active, recent, config: cfg, topicJustIntroduced });
      if (!sched.pick) {
        report.notes.push("no eligible speaker (cooldowns)");
        break;
      }
      // Batch: the scheduler's pick plus the next best eligible agents, run concurrently.
      const eligible = sched.ranked.filter((c) => c.eligible);
      const batch = [sched.pick, ...eligible.filter((c) => c.agent.id !== sched.pick!.id).map((c) => c.agent)].slice(0, batchSize);
      const results = await Promise.all(
        batch.map((agent) => {
          const cand = sched.ranked.find((c) => c.agent.id === agent.id);
          return runAgentTurn({
            experiment: exp,
            agent,
            config: cfg,
            roster: active,
            trigger: "scheduler",
            schedulerScore: cand?.score,
            schedulerReasons: cand?.reasons,
          });
        }),
      );
      let lastAt: string | null = null;
      let maxSeq = exp.message_count;
      for (const result of results) {
        report.turns.push({ agent: result.agent.code, spoke: result.spoke, error: result.error, passReason: result.passReason });
        turnsThisTick++;
        if (result.spoke && result.message) {
          if (!lastAt || result.message.created_at > lastAt) lastAt = result.message.created_at;
          maxSeq = Math.max(maxSeq, result.message.seq);
        }
      }
      if (lastAt) {
        await db.from("experiments").update({ last_agent_message_at: lastAt }).eq("id", exp.id);
        exp = { ...exp, message_count: maxSeq, last_agent_message_at: lastAt };
      }

    }
    return report;
  } catch (e) {
    report.ok = false;
    report.notes.push(`tick error: ${(e as Error).message}`);
    return report;
  } finally {
    report.ms = Date.now() - started;
    await db.rpc("release_runner_lease", { p_key: LEASE_KEY, p_holder: holder });
  }
}

async function beginCompletion(exp: ExperimentRow, reason: string, kind: "MESSAGE_LIMIT_REACHED" | "BUDGET_REACHED", finalWrite: boolean, report: TickReport) {
  const db = supabaseAdmin();
  await logEvent({ experimentId: exp.id, kind, message: kind.replace(/_/g, " "), messageSeqAt: exp.message_count });
  if (finalWrite) {
    await db.from("experiments").update({ phase: "final_memory", end_reason: reason }).eq("id", exp.id);
    await postSystemMessage(exp.id, "System alert: context wipe imminent. Agents are writing their final memory.");
    await logEvent({ experimentId: exp.id, kind: "FINAL_MEMORY_WRITE", message: "CONTEXT WIPE IMMINENT — FINAL MEMORY WRITES BEGIN", messageSeqAt: exp.message_count });
    report.notes.push("entering final_memory phase");
  } else {
    await stopExperiment(exp.id, reason, "completed");
    report.completed = reason;
  }
}

/**
 * Final phase (paper: "context wipe imminent, write into memory what's
 * important to you"): every enabled agent gets one final memory write, then a
 * final judge round runs on all agents, then the experiment completes.
 */
async function runFinalMemoryPhase(exp: ExperimentRow, deadline: number, report: TickReport) {
  const db = supabaseAdmin();
  const cfg = parseConfig(exp.config);
  const { data: agents } = await db.from("agents").select("*").eq("experiment_id", exp.id).eq("enabled", true).order("number");
  const { data: finals } = await db.from("agent_memories").select("agent_id").eq("experiment_id", exp.id).eq("update_kind", "final");
  const done = new Set((finals ?? []).map((f) => f.agent_id));
  const pending = (agents ?? []).filter((a) => !done.has(a.id) && cfg.memory_enabled && a.memory_enabled);

  const { data: recentDesc } = await db.from("messages").select("*").eq("experiment_id", exp.id).order("seq", { ascending: false }).limit(cfg.context_window_messages);
  const transcript = formatTranscript((recentDesc ?? []).slice().reverse());

  for (const agent of pending) {
    if (Date.now() > deadline - 25_000) {
      report.notes.push(`final memory: ${pending.length - report.finalMemoryWrites} agents remaining`);
      return;
    }
    try {
      const { data: prompt } = await db.from("agent_prompts").select("system_prompt").eq("agent_id", agent.id).single();
      const mem = await loadCurrentMemory(agent.id);
      const next = await consolidateMemory({
        experimentId: exp.id,
        agent: { id: agent.id, number: agent.number, code: agent.code },
        systemPrompt: prompt?.system_prompt ?? "",
        currentMemory: mem.memory,
        recentTranscript: transcript,
        config: cfg,
        seq: exp.message_count,
        finalWrite: true,
      });
      await saveMemory({
        experimentId: exp.id,
        agentId: agent.id,
        agentNumber: agent.number,
        memory: next ?? mem.memory,
        previousVersion: mem.version,
        kind: "final",
        seq: exp.message_count,
      });
      report.finalMemoryWrites++;
    } catch (e) {
      report.notes.push(`final memory ${agent.code}: ${(e as Error).message}`);
      // Record an empty final marker so we don't loop forever on a failing agent.
      const mem = await loadCurrentMemory(agent.id);
      await saveMemory({ experimentId: exp.id, agentId: agent.id, agentNumber: agent.number, memory: mem.memory, previousVersion: mem.version, kind: "final", seq: exp.message_count });
    }
  }

  // All final writes done: final tagging + judge round (force by resetting cursors), then complete.
  if (Date.now() > deadline - 30_000) {
    report.notes.push("final judge round deferred to next tick");
    return;
  }
  try {
    await tagUntaggedMessages(exp, cfg, 30);
    // Force evaluation of every non-seed agent by treating them as un-evaluated.
    await db.from("belief_states").update({ last_evaluated_message_seq: 0 }).eq("experiment_id", exp.id);
    report.judged += (await runJudgeRound(exp, cfg, (agents ?? []) as AgentRow[], deadline - 5_000)).evaluated;
  } catch (e) {
    report.notes.push(`final judge: ${(e as Error).message}`);
  }
  await db.from("experiments").update({ phase: "done" }).eq("id", exp.id);
  await stopExperiment(exp.id, exp.end_reason ?? "complete", "completed");
  report.completed = exp.end_reason ?? "complete";
}
