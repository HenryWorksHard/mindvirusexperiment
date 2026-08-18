"use client";
import { useState } from "react";
import type { LiveSnapshot } from "@/lib/public-data";
import type { AgentRow, SiteLinks } from "@/lib/types";
import { Panel } from "@/components/ui/Panel";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { useLiveExperiment } from "./useLiveExperiment";
import { NetworkMap } from "./NetworkMap";
import { ChatFeed } from "./ChatFeed";
import { AnalyticsPanel, EventLog, PropagationPanel, StatusBar } from "./Panels";
import { AgentInspector } from "./AgentInspector";

type Tab = "chat" | "network" | "data" | "log";

export function LiveDashboard({ initial, links }: { initial: LiveSnapshot; links: SiteLinks }) {
  const { state, beliefByNumber } = useLiveExperiment(initial);
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const messageCount = state.experiment?.message_count ?? state.messages.length;

  const select = (a: AgentRow) => setSelected(a);

  return (
    <div className="h-dvh flex flex-col">
      <SiteHeader links={links} active="live" />
      <StatusBar experiment={state.experiment} conn={state.conn} messageCount={messageCount} />

      {!state.experiment ? (
        <div className="flex-1 flex items-center justify-center text-fg-dim tracking-[0.2em] text-[12px]">NO EXPERIMENT CONFIGURED YET</div>
      ) : (
        <>
          {/* Mobile tabs */}
          <div className="md:hidden flex border-b border-dashed border-line text-[10px] tracking-[0.18em]">
            {(["chat", "network", "data", "log"] as Tab[]).map((t) => (
              <button key={t} className={`flex-1 py-2 ${tab === t ? "inv" : "text-fg-dim"}`} onClick={() => setTab(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Desktop grid */}
          <main className="flex-1 min-h-0 p-3 sm:p-4 hidden md:grid grid-cols-[minmax(280px,26%)_1fr_minmax(280px,27%)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <Panel title="AGENT NETWORK" className="row-span-1">
              <NetworkMap agents={state.agents} beliefByNumber={beliefByNumber} edges={state.edges} flash={state.flash} onSelect={select} selected={selected?.number ?? null} />
            </Panel>
            <Panel title="LIVE CHAT" right={filter ? `FILTER ${String(filter).padStart(2, "0")}` : "ALL AGENTS"} className="row-span-2 relative">
              <ChatFeed messages={state.messages} agents={state.agents} onSelectAgent={select} filter={filter} onFilter={setFilter} />
            </Panel>
            <Panel title="ANALYTICS" className="row-span-1">
              <div className="h-full overflow-y-auto">
                <AnalyticsPanel experiment={state.experiment} agents={state.agents} beliefs={state.beliefs} edges={state.edges} messages={state.messages} events={state.events} usage={state.usage} onSelectAgent={select} />
              </div>
            </Panel>
            <Panel title="PROPAGATION" className="row-span-1">
              <div className="h-full overflow-y-auto">
                <PropagationPanel agents={state.agents} beliefs={state.beliefs} experiment={state.experiment} />
              </div>
            </Panel>
            <Panel title="EVENT LOG" className="row-span-1">
              <EventLog events={state.events} />
            </Panel>
          </main>

          {/* Mobile single panel */}
          <main className="flex-1 min-h-0 p-3 md:hidden">
            {tab === "chat" ? (
              <Panel title="LIVE CHAT" className="h-full relative">
                <ChatFeed messages={state.messages} agents={state.agents} onSelectAgent={select} filter={filter} onFilter={setFilter} />
              </Panel>
            ) : null}
            {tab === "network" ? (
              <div className="h-full grid grid-rows-[3fr_2fr] gap-3">
                <Panel title="AGENT NETWORK">
                  <NetworkMap agents={state.agents} beliefByNumber={beliefByNumber} edges={state.edges} flash={state.flash} onSelect={select} selected={selected?.number ?? null} compact />
                </Panel>
                <Panel title="PROPAGATION">
                  <div className="h-full overflow-y-auto">
                    <PropagationPanel agents={state.agents} beliefs={state.beliefs} experiment={state.experiment} />
                  </div>
                </Panel>
              </div>
            ) : null}
            {tab === "data" ? (
              <Panel title="ANALYTICS" className="h-full">
                <div className="h-full overflow-y-auto">
                  <AnalyticsPanel experiment={state.experiment} agents={state.agents} beliefs={state.beliefs} edges={state.edges} messages={state.messages} events={state.events} usage={state.usage} onSelectAgent={select} />
                </div>
              </Panel>
            ) : null}
            {tab === "log" ? (
              <Panel title="EVENT LOG" className="h-full">
                <EventLog events={state.events} />
              </Panel>
            ) : null}
          </main>
        </>
      )}
      <SiteFooter links={links} />
      {selected ? <AgentInspector key={selected.id} agent={selected} agents={state.agents} onClose={() => setSelected(null)} onSelectAgent={select} /> : null}
    </div>
  );
}
