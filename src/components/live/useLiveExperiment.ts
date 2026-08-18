"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AgentRow, BeliefStateRow, ExperimentEventRow, ExperimentRow, InfluenceEdgeRow, MessageRow } from "@/lib/types";
import type { EdgeAgg, LiveSnapshot } from "@/lib/public-data";

export type ConnState = "connecting" | "live" | "polling" | "offline";

export interface LiveState {
  experiment: ExperimentRow | null;
  agents: AgentRow[];
  beliefs: BeliefStateRow[];
  messages: MessageRow[];
  events: ExperimentEventRow[];
  edges: EdgeAgg[];
  usage: LiveSnapshot["usage"];
  conn: ConnState;
  /** last reply flash: [source, target, at] */
  flash: { source: number; target: number; at: number; id: string }[];
}

function aggregateInto(edges: EdgeAgg[], e: Pick<InfluenceEdgeRow, "source_agent_number" | "target_agent_number" | "kind" | "weight" | "created_at">): EdgeAgg[] {
  const idx = edges.findIndex((x) => x.source === e.source_agent_number && x.target === e.target_agent_number);
  const cur: EdgeAgg = idx >= 0 ? { ...edges[idx] } : { source: e.source_agent_number, target: e.target_agent_number, reply: 0, mention: 0, estimated: 0, weight: 0, last_at: e.created_at };
  if (e.kind === "reply") cur.reply += 1;
  else if (e.kind === "mention") cur.mention += 1;
  else cur.estimated += e.weight;
  cur.weight += e.kind === "estimated_influence" ? e.weight * 2 : e.weight;
  if (e.created_at > cur.last_at) cur.last_at = e.created_at;
  const next = edges.slice();
  if (idx >= 0) next[idx] = cur;
  else next.push(cur);
  return next;
}

export function useLiveExperiment(initial: LiveSnapshot, opts: { pollMs?: number; followCurrent?: boolean } = {}) {
  const [state, setState] = useState<LiveState>({
    experiment: initial.experiment,
    agents: initial.agents,
    beliefs: initial.beliefs,
    messages: initial.messages,
    events: initial.events,
    edges: initial.edges,
    usage: initial.usage,
    conn: "connecting",
    flash: [],
  });
  const expId = initial.experiment?.id ?? null;
  const lastRealtimeAt = useRef<number>(0);
  const pollMs = opts.pollMs ?? 20_000;

  // Realtime subscriptions
  useEffect(() => {
    if (!expId) return;
    const sb = supabaseBrowser();
    const filter = `experiment_id=eq.${expId}`;
    const ch = sb
      .channel(`exp-${expId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => {
        const m = p.new as MessageRow;
        lastRealtimeAt.current = Date.now();
        setState((s) => (s.messages.some((x) => x.id === m.id) ? s : { ...s, messages: [...s.messages, m].sort((a, b) => a.seq - b.seq).slice(-400) }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (p) => {
        const m = p.new as MessageRow;
        setState((s) => ({ ...s, messages: s.messages.map((x) => (x.id === m.id ? m : x)) }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agents", filter }, (p) => {
        const a = p.new as AgentRow;
        lastRealtimeAt.current = Date.now();
        setState((s) => {
          const exists = s.agents.some((x) => x.id === a.id);
          const agents = exists ? s.agents.map((x) => (x.id === a.id ? a : x)) : [...s.agents, a].sort((x, y) => x.number - y.number);
          return { ...s, agents };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "belief_states", filter }, (p) => {
        const b = p.new as BeliefStateRow;
        setState((s) => {
          const exists = s.beliefs.some((x) => x.id === b.id);
          const beliefs = exists ? s.beliefs.map((x) => (x.id === b.id ? b : x)) : [...s.beliefs, b].sort((x, y) => x.agent_number - y.agent_number);
          return { ...s, beliefs };
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "experiment_events", filter }, (p) => {
        const e = p.new as ExperimentEventRow;
        setState((s) => (s.events.some((x) => x.id === e.id) ? s : { ...s, events: [...s.events, e].slice(-300) }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "influence_edges", filter }, (p) => {
        const e = p.new as InfluenceEdgeRow;
        setState((s) => {
          const flash = e.kind === "reply" ? [...s.flash, { source: e.source_agent_number, target: e.target_agent_number, at: Date.now(), id: e.id }].slice(-12) : s.flash;
          return { ...s, edges: aggregateInto(s.edges, e), flash };
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "experiments", filter: `id=eq.${expId}` }, (p) => {
        const e = p.new as ExperimentRow;
        lastRealtimeAt.current = Date.now();
        setState((s) => ({
          ...s,
          experiment: e,
          usage: { calls: e.total_llm_calls, prompt_tokens: Number(e.total_prompt_tokens), completion_tokens: Number(e.total_completion_tokens), cost_usd: Number(e.total_cost_usd) },
        }));
      })
      .subscribe((status) => {
        setState((s) => ({ ...s, conn: status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "polling" : s.conn }));
      });
    return () => {
      sb.removeChannel(ch);
    };
  }, [expId]);

  // Polling fallback / reconciliation (also detects a new current experiment)
  const poll = useCallback(async () => {
    try {
      const url = expId ? `/api/public/snapshot?experiment=${expId}&messages=120&events=80` : `/api/public/snapshot`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const snap = (await res.json()) as LiveSnapshot & { current_experiment_id?: string | null };
      if (opts.followCurrent !== false && snap.current_experiment_id && snap.current_experiment_id !== expId) {
        window.location.reload();
        return;
      }
      setState((s) => {
        const byId = new Map(s.messages.map((m) => [m.id, m]));
        for (const m of snap.messages) byId.set(m.id, m);
        const messages = [...byId.values()].sort((a, b) => a.seq - b.seq).slice(-400);
        const evById = new Map(s.events.map((e) => [e.id, e]));
        for (const e of snap.events) evById.set(e.id, e);
        const events = [...evById.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-300);
        return {
          ...s,
          experiment: snap.experiment ?? s.experiment,
          agents: snap.agents.length ? snap.agents : s.agents,
          beliefs: snap.beliefs.length ? snap.beliefs : s.beliefs,
          messages,
          events,
          edges: snap.edges.length ? snap.edges : s.edges,
          usage: snap.usage,
          conn: s.conn === "live" && Date.now() - lastRealtimeAt.current < 120_000 ? "live" : s.conn === "offline" ? "polling" : s.conn === "connecting" ? "polling" : s.conn,
        };
      });
    } catch {
      setState((s) => ({ ...s, conn: "offline" }));
    }
  }, [expId, opts.followCurrent]);

  useEffect(() => {
    const t = setInterval(poll, pollMs);
    return () => clearInterval(t);
  }, [poll, pollMs]);

  // prune flashes
  useEffect(() => {
    const t = setInterval(() => setState((s) => (s.flash.length ? { ...s, flash: s.flash.filter((f) => Date.now() - f.at < 4000) } : s)), 1000);
    return () => clearInterval(t);
  }, []);

  const agentByNumber = useMemo(() => new Map(state.agents.map((a) => [a.number, a])), [state.agents]);
  const beliefByNumber = useMemo(() => new Map(state.beliefs.map((b) => [b.agent_number, b])), [state.beliefs]);

  return { state, agentByNumber, beliefByNumber, refresh: poll };
}
