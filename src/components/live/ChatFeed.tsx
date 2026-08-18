"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRow, MessageRow } from "@/lib/types";
import { clock, codeOf } from "@/lib/format";

export function ChatFeed({
  messages,
  agents,
  onSelectAgent,
  filter,
  onFilter,
  showFilterBar = true,
  autoScroll = true,
}: {
  messages: MessageRow[];
  agents: AgentRow[];
  onSelectAgent: (agent: AgentRow) => void;
  filter: number | null;
  onFilter: (n: number | null) => void;
  showFilterBar?: boolean;
  autoScroll?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const agentByNumber = useMemo(() => new Map(agents.map((a) => [a.number, a])), [agents]);
  const list = useMemo(() => (filter ? messages.filter((m) => m.agent_number === filter || (m.addressed_agent_numbers ?? []).includes(filter)) : messages), [messages, filter]);

  useEffect(() => {
    if (!autoScroll || !stick) return;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, stick, autoScroll]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {showFilterBar ? (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-dashed border-line text-[10px] tracking-widest overflow-x-auto">
          <span className="text-fg-faint shrink-0">FILTER</span>
          <button className={`px-1 shrink-0 ${filter === null ? "inv" : "text-fg-dim hover:text-fg"}`} onClick={() => onFilter(null)}>
            ALL
          </button>
          {agents.map((a) => (
            <button key={a.id} className={`px-1 shrink-0 ${filter === a.number ? "inv" : "text-fg-dim hover:text-fg"}`} onClick={() => onFilter(filter === a.number ? null : a.number)} title={a.name}>
              {a.code}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={ref} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        {list.length === 0 ? <div className="text-fg-faint py-6 text-center text-[11px] tracking-widest">NO MESSAGES YET</div> : null}
        {list.map((m) => (
          <MessageItem key={m.id} m={m} agent={m.agent_number != null ? agentByNumber.get(m.agent_number) : undefined} onSelectAgent={onSelectAgent} agentByNumber={agentByNumber} />
        ))}
      </div>
      {!stick ? (
        <button
          className="absolute bottom-2 right-3 btn text-[9px] py-[2px] px-2 bg-bg"
          onClick={() => {
            setStick(true);
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          v LATEST
        </button>
      ) : null}
    </div>
  );
}

function MessageItem({
  m,
  agent,
  onSelectAgent,
  agentByNumber,
}: {
  m: MessageRow;
  agent?: AgentRow;
  onSelectAgent: (agent: AgentRow) => void;
  agentByNumber: Map<number, AgentRow>;
}) {
  if (m.kind === "system") {
    return (
      <div className="text-fg-dim">
        <div className="text-[10px] tracking-widest text-fg-faint">
          [{clock(m.created_at)}] SYSTEM <span className="text-fg-faint">#{m.seq}</span>
        </div>
        <div className="border-l border-dashed border-line pl-2 mt-[2px] text-[12px] text-fg-dim">{m.content}</div>
      </div>
    );
  }
  const seedRel = m.seed_relevance ?? null;
  const relMark = seedRel != null && seedRel >= 0.5 ? (m.seed_stance != null && m.seed_stance > 0.3 ? "+" : m.seed_stance != null && m.seed_stance < -0.3 ? "-" : "~") : null;
  return (
    <div>
      <div className="text-[10px] tracking-widest flex items-baseline gap-2 flex-wrap">
        <span className="text-fg-faint">[{clock(m.created_at)}]</span>
        <button className={`hover:underline ${agent?.is_seed ? "inv px-1" : "text-fg"}`} onClick={() => agent && onSelectAgent(agent)} title={agent?.archetype}>
          {m.agent_code} / {m.agent_name}
          {agent?.is_seed ? " [SEED]" : ""}
        </button>
        {m.addressed_agent_numbers?.length ? (
          <span className="text-fg-dim">
            -&gt;{" "}
            {m.addressed_agent_numbers.map((n, i) => {
              const a = agentByNumber.get(n);
              return (
                <button key={n} className="hover:underline" onClick={() => a && onSelectAgent(a)}>
                  {codeOf(n)}
                  {i < m.addressed_agent_numbers.length - 1 ? "," : ""}
                </button>
              );
            })}
          </span>
        ) : null}
        <span className="text-fg-faint">#{m.seq}</span>
        {relMark ? (
          <span className="text-fg-faint" title={`seed relevance ${seedRel?.toFixed(2)} / stance ${m.seed_stance?.toFixed(2)}`}>
            [SEED{relMark}]
          </span>
        ) : null}
      </div>
      <div className={`mt-[2px] text-[12.5px] leading-[1.55] whitespace-pre-wrap ${agent?.is_seed ? "text-fg" : "text-fg"}`}>{m.content}</div>
    </div>
  );
}
