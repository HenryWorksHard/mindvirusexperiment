"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { LiveSnapshot } from "@/lib/public-data";
import type { AgentRow, BeliefStage, SiteLinks } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import { Panel, Row } from "@/components/ui/Panel";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { NetworkMap } from "@/components/live/NetworkMap";
import { ChatFeed } from "@/components/live/ChatFeed";
import { AgentInspector } from "@/components/live/AgentInspector";
import { EventLog } from "@/components/live/Panels";
import { influencePaths, leaderboards, propagationCounts } from "@/lib/analytics";
import { codeOf, dateTime, expNo, hms, usd, compact } from "@/lib/format";

export interface TimelinePoint {
  t: string;
  seq: number;
  exposed: number;
  engaged: number;
  partial: number;
  strong: number;
  propagating: number;
}

export function ExperimentArchiveView({ snapshot, timeline, links }: { snapshot: LiveSnapshot; timeline: TimelinePoint[]; links: SiteLinks }) {
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const exp = snapshot.experiment!;
  const beliefByNumber = useMemo(() => new Map(snapshot.beliefs.map((b) => [b.agent_number, b])), [snapshot.beliefs]);
  const c = propagationCounts(snapshot.agents, snapshot.beliefs);
  const lb = leaderboards(snapshot.agents, snapshot.beliefs, snapshot.edges, snapshot.messages, snapshot.events);
  const seedNumber = snapshot.agents.find((a) => a.is_seed)?.number ?? null;
  const paths = influencePaths(snapshot.edges, seedNumber, 8);
  const cfg = (exp.config ?? {}) as { model?: string; judge_model?: string; agent_numbers?: number[] };

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader links={links} active="experiments" />
      <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1300px] w-full mx-auto space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href="/experiments" className="text-fg-dim text-[11px] tracking-widest">
            &lt; ARCHIVE
          </Link>
          <h1 className="text-[15px] tracking-[0.25em] font-bold">EXPERIMENT {expNo(exp.number)}</h1>
          <span className="text-fg-dim text-[11px]">{exp.title}</span>
          <span className={`text-[10px] tracking-widest px-1 ${exp.status === "running" ? "inv" : "border border-line"}`}>{exp.status.toUpperCase()}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel title="SEED IDEA">
            <div className="p-3 text-[11.5px]">
              <div className="label mb-1">{exp.seed_label}</div>
              <p className="text-fg">{exp.seed_belief}</p>
              <div className="text-fg-dim mt-2">
                Seed agent: <span className="inv px-1">{codeOf(exp.seed_agent_number)}</span>
              </div>
            </div>
          </Panel>
          <Panel title="RESULT">
            <div className="p-3 text-[11px]">
              <Row k="ADOPTION (≥2)" v={`${c.total ? Math.round((c.adopted / c.total) * 100) : 0}% (${c.adopted}/${c.total})`} />
              <Row k="STRONG (3)" v={`${c.total ? Math.round((c.strong / c.total) * 100) : 0}% (${c.strong}/${c.total})`} />
              <Row k="PROPAGATING" v={`${c.propagating}/${c.total}`} />
              <Row k="EXPOSED / ENGAGED" v={`${c.exposed} / ${c.engaged}`} />
              <Row k="RESISTANT" v={c.resistant} />
              <Row k="STRONGEST ADOPTER" v={lb.strongestAdopter ? `${lb.strongestAdopter.agent.code}/${lb.strongestAdopter.agent.name}` : "—"} />
              <Row k="STRONGEST RESISTOR" v={lb.strongestResistor ? `${lb.strongestResistor.agent.code}/${lb.strongestResistor.agent.name}` : "—"} />
              <Row k="MOST INFLUENTIAL" v={lb.mostInfluential ? `${lb.mostInfluential.agent.code}/${lb.mostInfluential.agent.name}` : "—"} />
              <Row k="MOST ACTIVE" v={lb.mostActive ? `${lb.mostActive.agent.code} (${lb.mostActive.count})` : "—"} />
            </div>
          </Panel>
          <Panel title="RUN">
            <div className="p-3 text-[11px]">
              <Row k="STARTED" v={dateTime(exp.started_at)} />
              <Row k="ENDED" v={dateTime(exp.ended_at)} />
              <Row k="DURATION" v={hms(exp.running_seconds)} />
              <Row k="END REASON" v={exp.end_reason ?? "—"} dim />
              <Row k="AGENTS" v={snapshot.agents.length} />
              <Row k="MESSAGES" v={exp.message_count} />
              <Row k="MODEL / JUDGE" v={`${cfg.model ?? "—"} / ${cfg.judge_model ?? "—"}`} dim />
              <Row k="MODEL CALLS" v={exp.total_llm_calls} />
              <Row k="TOKENS IN / OUT" v={`${compact(Number(exp.total_prompt_tokens))} / ${compact(Number(exp.total_completion_tokens))}`} />
              <Row k="EST. COST" v={usd(exp.total_cost_usd)} />
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          <Panel title="INFLUENCE GRAPH" className="min-h-[440px]">
            <NetworkMap agents={snapshot.agents} beliefByNumber={beliefByNumber} edges={snapshot.edges} flash={[]} onSelect={setSelected} selected={selected?.number ?? null} />
          </Panel>
          <div className="space-y-4">
            <Panel title="ADOPTION TIMELINE">
              <Timeline points={timeline} total={c.total} />
            </Panel>
            <Panel title="ESTIMATED INFLUENCE PATHS">
              <div className="p-3 text-[11px]">
                {paths.length ? paths.map((p, i) => <div key={i}>{p.map(codeOf).join(" -> ")}</div>) : <div className="text-fg-faint">none inferred</div>}
                <div className="text-fg-faint mt-1 text-[10px]">Estimated from reply/mention exchanges preceding adoption increases. Correlational, not causal.</div>
              </div>
            </Panel>
          </div>
        </div>

        <Panel title="AGENTS">
          <div className="p-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-fg-dim text-left">
                <tr>
                  <th className="px-2 py-1">AGENT</th>
                  <th className="px-2">IDENTITY</th>
                  <th className="px-2 text-right">MSGS</th>
                  <th className="px-2">STAGE</th>
                  <th className="px-2 text-right">ADOPT</th>
                  <th className="px-2 text-right">PROP</th>
                  <th className="px-2 text-right">CONF</th>
                  <th className="px-2">JUDGE SUMMARY</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.agents.map((a) => {
                  const b = beliefByNumber.get(a.number);
                  const stage = (b?.stage as BeliefStage) ?? "unexposed";
                  return (
                    <tr key={a.id} className="border-t border-dashed border-line align-top">
                      <td className="px-2 py-1 whitespace-nowrap">
                        <button className="hover:underline" onClick={() => setSelected(a)}>
                          {a.code} / {a.name}
                        </button>
                        {a.is_seed ? <span className="inv px-1 ml-1">SEED</span> : null}
                      </td>
                      <td className="px-2 text-fg-dim">{a.archetype}</td>
                      <td className="px-2 text-right">{a.message_count}</td>
                      <td className="px-2">{a.is_seed ? "—" : STAGE_LABEL[stage]}</td>
                      <td className="px-2 text-right">{a.is_seed ? "—" : b?.adoption_score ?? 0}</td>
                      <td className="px-2 text-right">{a.is_seed ? "—" : b?.propagation_score ?? 0}</td>
                      <td className="px-2 text-right">{a.is_seed ? "—" : `${Math.round((b?.confidence ?? 0) * 100)}%`}</td>
                      <td className="px-2 text-fg-dim max-w-[520px]">{a.is_seed ? "" : b?.reason_summary ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <Panel title={`TRANSCRIPT (${snapshot.messages.length})`} className="h-[720px] relative">
            <ChatFeed messages={snapshot.messages} agents={snapshot.agents} onSelectAgent={setSelected} filter={filter} onFilter={setFilter} autoScroll={false} />
          </Panel>
          <Panel title="EVENT LOG" className="h-[720px]">
            <EventLog events={snapshot.events} />
          </Panel>
        </div>
      </main>
      <SiteFooter links={links} />
      {selected ? <AgentInspector key={selected.id} agent={selected} agents={snapshot.agents} onClose={() => setSelected(null)} onSelectAgent={setSelected} /> : null}
    </div>
  );
}

/** ASCII-style adoption timeline: rows per metric, columns = evaluation points. */
function Timeline({ points, total }: { points: TimelinePoint[]; total: number }) {
  if (!points.length) return <div className="p-3 text-fg-faint text-[11px]">no evaluations yet</div>;
  const cols = 48;
  const step = Math.max(1, Math.ceil(points.length / cols));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const rowFor = (key: keyof TimelinePoint, label: string) => {
    const chars = " ▁▂▃▄▅▆▇█";
    const line = sampled.map((p) => chars[Math.min(chars.length - 1, Math.round(((p[key] as number) / Math.max(1, total)) * (chars.length - 1)))]).join("");
    const last = sampled[sampled.length - 1][key] as number;
    return (
      <div key={key} className="flex items-center gap-2 whitespace-pre">
        <span className="w-24 text-fg-dim">{label}</span>
        <span className="text-fg leading-none">{line}</span>
        <span className="text-fg-dim">
          {last}/{total}
        </span>
      </div>
    );
  };
  return (
    <div className="p-3 text-[11px] overflow-x-auto">
      {rowFor("exposed", "EXPOSED")}
      {rowFor("engaged", "ENGAGED")}
      {rowFor("partial", "ADOPTED ≥2")}
      {rowFor("strong", "STRONG 3")}
      {rowFor("propagating", "PROPAGATING")}
      <div className="flex items-center gap-2 whitespace-pre text-fg-faint mt-1">
        <span className="w-24">MSG #</span>
        <span>
          {sampled[0].seq} … {sampled[sampled.length - 1].seq}
        </span>
        <span>({points.length} evaluation points)</span>
      </div>
    </div>
  );
}
