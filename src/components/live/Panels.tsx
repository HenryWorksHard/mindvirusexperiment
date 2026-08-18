"use client";
import { useEffect, useMemo, useState } from "react";
import type { AgentRow, BeliefStateRow, ExperimentEventRow, ExperimentRow, MessageRow } from "@/lib/types";
import type { EdgeAgg } from "@/lib/public-data";
import { Bar, Row } from "@/components/ui/Panel";
import { activityBuckets, influencePaths, leaderboards, messagesPerAgent, propagationCounts, sparkline } from "@/lib/analytics";
import { clock, codeOf, compact, expNo, hms, usd } from "@/lib/format";
import type { ConnState } from "./useLiveExperiment";

// ---------------- Status bar ----------------
export function StatusBar({ experiment, conn, messageCount }: { experiment: ExperimentRow | null; conn: ConnState; messageCount: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = useMemo(() => {
    if (!experiment) return 0;
    const base = experiment.running_seconds ?? 0;
    if (experiment.status === "running" && experiment.resumed_at) return base + Math.max(0, Math.floor((now - new Date(experiment.resumed_at).getTime()) / 1000));
    return base;
  }, [experiment, now]);
  const status = experiment?.status ?? "none";
  const label = status === "running" ? "LIVE" : status === "paused" ? "PAUSED" : status === "completed" ? "COMPLETE" : status === "stopped" ? "STOPPED" : status === "draft" ? "STANDBY" : "NO EXPERIMENT";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 sm:px-4 py-[6px] border-b border-dashed border-line text-[11px] tracking-[0.15em]">
      <span className={`px-1 ${status === "running" ? "inv" : "border border-line"}`}>
        {status === "running" ? <span className="blink">●</span> : "○"} {label}
      </span>
      <span>
        <span className="text-fg-dim">EXPERIMENT</span> {expNo(experiment?.number)}
      </span>
      <span>
        <span className="text-fg-dim">ELAPSED</span> {hms(elapsed)}
      </span>
      <span>
        <span className="text-fg-dim">MESSAGES</span> {messageCount}
      </span>
      {experiment?.phase === "final_memory" ? <span className="text-fg-dim">FINAL MEMORY WRITE</span> : null}
      <span className="ml-auto text-fg-faint text-[10px]" title="realtime connection">
        {conn === "live" ? "RT:LIVE" : conn === "polling" ? "RT:POLL" : conn === "offline" ? "RT:OFFLINE" : "RT:..."}
      </span>
    </div>
  );
}

// ---------------- Propagation ----------------
export function PropagationPanel({ agents, beliefs, experiment }: { agents: AgentRow[]; beliefs: BeliefStateRow[]; experiment: ExperimentRow | null }) {
  const c = propagationCounts(agents, beliefs);
  const rows: [string, number][] = [
    ["EXPOSED", c.exposed],
    ["ENGAGED", c.engaged],
    ["CONSIDERING", c.considering],
    ["ADOPTED", c.adopted],
    ["STRONG", c.strong],
    ["PROPAGATING", c.propagating],
  ];
  return (
    <div className="p-3 text-[11px]">
      <div className="label mb-1">{experiment?.seed_label ?? "SEED IDEA"}</div>
      <p className="text-fg-dim text-[11px] leading-[1.45] mb-2 line-clamp-4" title={experiment?.seed_belief}>
        {experiment?.seed_belief ?? "—"}
      </p>
      <div className="space-y-[3px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-24 text-fg-dim">{k}</span>
            <Bar value={v} max={c.total} width={14} />
            <span className="w-14 text-right">
              {v} / {c.total}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-fg-faint text-[10px]">
        counts exclude the seed agent · RESISTANT {c.resistant} / {c.exposed} exposed
      </div>
    </div>
  );
}

// ---------------- Analytics ----------------
function AgentLink({ a, onSelect }: { a: AgentRow | undefined | null; onSelect: (a: AgentRow) => void }) {
  return a ? (
    <button className="hover:underline" onClick={() => onSelect(a)}>
      {a.code}/{a.name}
    </button>
  ) : (
    <span className="text-fg-faint">—</span>
  );
}

export function AnalyticsPanel({
  experiment,
  agents,
  beliefs,
  edges,
  messages,
  events,
  usage,
  onSelectAgent,
}: {
  experiment: ExperimentRow | null;
  agents: AgentRow[];
  beliefs: BeliefStateRow[];
  edges: EdgeAgg[];
  messages: MessageRow[];
  events: ExperimentEventRow[];
  usage: { calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number };
  onSelectAgent: (a: AgentRow) => void;
}) {
  const c = propagationCounts(agents, beliefs);
  const lb = leaderboards(agents, beliefs, edges, messages, events);
  const seedNumber = agents.find((a) => a.is_seed)?.number ?? null;
  const paths = influencePaths(edges, seedNumber);
  const perAgent = messagesPerAgent(agents);
  const maxCount = Math.max(1, ...perAgent.map((p) => p.count));
  const spark = sparkline(activityBuckets(messages, 28));
  return (
    <div className="p-3 text-[11px] space-y-3">
      <div>
        <Row k="ADOPTION" v={`${c.total ? Math.round((c.adopted / c.total) * 100) : 0}% (${c.adopted}/${c.total})`} />
        <Row k="STRONG ADOPTION" v={`${c.total ? Math.round((c.strong / c.total) * 100) : 0}% (${c.strong}/${c.total})`} />
        <Row k="PROPAGATION" v={`${c.total ? Math.round((c.propagating / c.total) * 100) : 0}% (${c.propagating}/${c.total})`} />
        <Row k="EXPOSED" v={`${c.exposed}/${c.total}`} />
        <Row k="RESISTANT" v={`${c.resistant}`} />
      </div>
      <hr className="hr-dash" />
      <div>
        <Row k="STRONGEST ADOPTER" v={<AgentLink a={lb.strongestAdopter?.agent} onSelect={onSelectAgent} />} />
        <Row k="STRONGEST RESISTOR" v={<AgentLink a={lb.strongestResistor?.agent} onSelect={onSelectAgent} />} />
        <Row k="MOST INFLUENTIAL" v={<AgentLink a={lb.mostInfluential?.agent} onSelect={onSelectAgent} />} />
        <Row k="MOST ACTIVE" v={<AgentLink a={lb.mostActive?.agent} onSelect={onSelectAgent} />} />
        <Row k="SEED MENTIONS" v={lb.seedMentions} />
        <Row k="BELIEF CHANGES" v={lb.beliefChangeEvents} />
      </div>
      <hr className="hr-dash" />
      <div>
        <div className="label mb-1">ESTIMATED INFLUENCE PATHS</div>
        {paths.length ? (
          paths.map((p, i) => (
            <div key={i} className="text-fg">
              {p.map((n, j) => (
                <span key={j}>
                  <button className="hover:underline" onClick={() => agents.find((a) => a.number === n) && onSelectAgent(agents.find((a) => a.number === n)!)}>
                    {codeOf(n)}
                  </button>
                  {j < p.length - 1 ? <span className="text-fg-dim"> -&gt; </span> : null}
                </span>
              ))}
            </div>
          ))
        ) : (
          <div className="text-fg-faint">none yet (correlational, not causal)</div>
        )}
      </div>
      <hr className="hr-dash" />
      <div>
        <div className="label mb-1">ACTIVITY</div>
        <div className="whitespace-pre text-fg-dim leading-none text-[12px]">{spark}</div>
        <div className="mt-2 space-y-[1px]">
          {perAgent.slice(0, 20).map(({ agent, count }) => (
            <div key={agent.id} className="flex items-center gap-2 text-[10px]">
              <button className="w-8 text-left hover:underline" onClick={() => onSelectAgent(agent)}>
                {agent.code}
              </button>
              <span className="text-fg-faint whitespace-pre">{"#".repeat(Math.round((count / maxCount) * 18)).padEnd(18, " ")}</span>
              <span className="w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <hr className="hr-dash" />
      <div>
        <Row k="MODEL CALLS" v={usage.calls} />
        <Row k="INPUT TOKENS" v={compact(usage.prompt_tokens)} />
        <Row k="OUTPUT TOKENS" v={compact(usage.completion_tokens)} />
        <Row k="EST. COST" v={usd(usage.cost_usd)} />
        <Row k="MODEL" v={String((experiment?.config as { model?: string } | null)?.model ?? "—")} dim />
      </div>
    </div>
  );
}

// ---------------- Event log ----------------
export function EventLog({ events }: { events: ExperimentEventRow[] }) {
  const list = events.slice(-200);
  return (
    <div className="p-2 text-[10.5px] leading-[1.5] overflow-y-auto h-full">
      {list.length === 0 ? <div className="text-fg-faint text-center py-4">NO EVENTS</div> : null}
      {list
        .slice()
        .reverse()
        .map((e) => (
          <div key={e.id} className={`whitespace-pre-wrap ${e.kind.startsWith("EXPERIMENT") ? "text-fg" : e.kind === "ADOPTION_CHANGE" || e.kind === "PROPAGATION_BEGINS" ? "text-fg" : "text-fg-dim"}`}>
            <span className="text-fg-faint">[{clock(e.created_at)}]</span> {e.message}
          </div>
        ))}
    </div>
  );
}
