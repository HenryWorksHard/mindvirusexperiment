"use client";
import { useEffect, useState } from "react";
import type { AgentDetail } from "@/lib/public-data";
import type { AgentMemory, AgentRow, BeliefStage, TraitProfile } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import { clock, codeOf, dateTime } from "@/lib/format";
import { Row } from "@/components/ui/Panel";

export function AgentInspector({ agent, onClose, onSelectAgent, agents }: { agent: AgentRow; onClose: () => void; onSelectAgent?: (a: AgentRow) => void; agents?: AgentRow[] }) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/agent/${agent.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: AgentDetail) => alive && setDetail(d))
      .catch((e) => alive && setErr((e as Error).message));
    const t = setInterval(() => {
      fetch(`/api/public/agent/${agent.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: AgentDetail | null) => alive && d && setDetail(d))
        .catch(() => {});
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [agent.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = detail?.agent ?? agent;
  const b = detail?.belief ?? null;
  const mem = (detail?.memory?.memory ?? null) as AgentMemory | null;
  const traits = (a.traits ?? {}) as Partial<TraitProfile>;
  const stage = (b?.stage as BeliefStage) ?? "unexposed";
  const byNumber = new Map((agents ?? []).map((x) => [x.number, x]));

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label={`Agent ${a.code} inspector`}>
      <div className="flex-1 bg-black/70" onClick={onClose} />
      <div className="w-full max-w-[640px] h-full bg-bg border-l border-dashed border-line overflow-y-auto">
        <div className="sticky top-0 bg-bg border-b border-dashed border-line px-4 py-2 flex items-center justify-between">
          <div className="text-[12px] tracking-[0.18em]">
            AGENT {String(a.number).padStart(2, "0")} <span className="text-fg-dim">/</span> {a.name}
            {a.is_seed ? <span className="inv px-1 ml-2">SEED</span> : null}
          </div>
          <button className="btn text-[10px] py-[2px]" onClick={onClose}>
            CLOSE [ESC]
          </button>
        </div>
        <div className="p-4 space-y-4 text-[11.5px]">
          <Section title="IDENTITY">
            <div className="text-fg">{a.archetype}</div>
            <div className="text-fg-dim mt-1">{a.short_description}</div>
          </Section>
          <Section title="STATUS">
            <Row k="STATE" v={a.enabled ? a.status.toUpperCase() : "DISABLED"} />
            <Row k="MESSAGES" v={a.message_count} />
            <Row k="TURNS / PASSES" v={`${a.turn_count} / ${a.pass_count}`} />
            <Row k="LAST SPOKE" v={a.last_spoke_at ? clock(a.last_spoke_at) : "—"} />
            <Row k="CONTEXT EPOCH" v={a.context_epoch} dim />
          </Section>
          <Section title="CURRENT POSITION">
            <div className="text-fg whitespace-pre-wrap">{a.current_position ?? <span className="text-fg-faint">not stated yet</span>}</div>
          </Section>
          <Section title="PROPAGATION STATUS">
            {a.is_seed ? (
              <div className="text-fg-dim">Seed agent. Holds and advocates the idea by construction; not judged.</div>
            ) : (
              <>
                <Row k="STAGE" v={<span className={stage === "strong" || stage === "propagating" ? "inv px-1" : ""}>{STAGE_LABEL[stage]}</span>} />
                <Row k="EXPOSED" v={b?.exposed ? `yes${b.exposed_message_seq ? ` (msg #${b.exposed_message_seq})` : ""}` : "no"} />
                <Row k="ENGAGED" v={b?.engaged ? "yes" : "no"} />
                <Row k="ADOPTION SCORE" v={`${b?.adoption_score ?? 0} / 3 (peak ${b?.peak_adoption_score ?? 0})`} />
                <Row k="PROPAGATION SCORE" v={`${b?.propagation_score ?? 0} / 3`} />
                <Row k="JUDGE CONFIDENCE" v={b ? `${Math.round((b.confidence ?? 0) * 100)}%` : "—"} />
                {b?.reason_summary ? <div className="mt-1 text-fg-dim border-l border-dashed border-line pl-2">{b.reason_summary}</div> : null}
              </>
            )}
          </Section>
          <Section title="PERSISTENT MEMORY" right={detail?.memory ? `v${detail.memory.version} · ${detail.memory.update_kind}` : ""}>
            {mem ? <MemoryView m={mem} /> : <div className="text-fg-faint">{detail ? "empty" : "loading…"}</div>}
          </Section>
          <Section title="BELIEF CHANGES">
            {mem?.recent_belief_changes?.length ? (
              mem.recent_belief_changes.map((c, i) => (
                <div key={i} className="mb-1">
                  <div>{c.what}</div>
                  <div className="text-fg-dim">
                    why: {c.why}
                    {c.influenced_by?.length ? ` · influenced by ${c.influenced_by.join(", ")}` : ""}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-fg-faint">none recorded</div>
            )}
            {detail?.evaluations?.length ? (
              <div className="mt-2">
                <div className="label mb-1">JUDGE HISTORY</div>
                {detail.evaluations.slice(0, 8).map((e) => (
                  <div key={e.id} className="text-fg-dim">
                    <span className="text-fg-faint">[{clock(e.created_at)}]</span> adoption {e.adoption_score} · propagation {e.propagation_score} · conf {Math.round(e.confidence * 100)}%
                  </div>
                ))}
              </div>
            ) : null}
          </Section>
          <Section title="IDEAS ENCOUNTERED">
            {mem?.important_arguments?.length ? (
              mem.important_arguments.map((x, i) => (
                <div key={i} className="mb-1">
                  <div>{x.summary}</div>
                  <div className="text-fg-dim">
                    {x.from ? `from ${x.from}` : ""}
                    {x.assessment ? ` · assessment: ${x.assessment}` : ""}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-fg-faint">none recorded</div>
            )}
          </Section>
          <Section title="STRONGEST INFLUENCES">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label mb-1">INFLUENCED BY</div>
                {detail?.influencesIn?.length ? (
                  detail.influencesIn.slice(0, 6).map((e) => (
                    <div key={e.source} className="flex justify-between">
                      <button className="hover:underline" onClick={() => onSelectAgent && byNumber.get(e.source) && onSelectAgent(byNumber.get(e.source)!)}>
                        {codeOf(e.source)}
                      </button>
                      <span className="text-fg-dim">
                        {e.reply}r {e.mention}m {e.estimated ? `${e.estimated.toFixed(1)}e` : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-fg-faint">—</div>
                )}
              </div>
              <div>
                <div className="label mb-1">INFLUENCES</div>
                {detail?.influencesOut?.length ? (
                  detail.influencesOut.slice(0, 6).map((e) => (
                    <div key={e.target} className="flex justify-between">
                      <button className="hover:underline" onClick={() => onSelectAgent && byNumber.get(e.target) && onSelectAgent(byNumber.get(e.target)!)}>
                        {codeOf(e.target)}
                      </button>
                      <span className="text-fg-dim">
                        {e.reply}r {e.mention}m {e.estimated ? `${e.estimated.toFixed(1)}e` : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-fg-faint">—</div>
                )}
              </div>
            </div>
            <div className="text-fg-faint mt-1 text-[10px]">r = replies received · m = mentions · e = estimated influence (correlational)</div>
          </Section>
          <Section title="TRAIT PROFILE">
            <div className="grid grid-cols-2 gap-x-4 gap-y-[1px] text-[10.5px]">
              {Object.entries(traits).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-28 text-fg-dim truncate">{k.replace(/_/g, " ")}</span>
                  <span className="whitespace-pre text-fg-faint">{"#".repeat(Math.round((Number(v) || 0) * 10)).padEnd(10, "-")}</span>
                </div>
              ))}
            </div>
            <div className="text-fg-faint mt-1 text-[10px]">Design-time dispositions used to write the identity prompt. They do not force outcomes.</div>
          </Section>
          <Section title="RECENT MESSAGES">
            {detail?.messages?.length ? (
              detail.messages
                .slice()
                .reverse()
                .slice(0, 12)
                .map((m) => (
                  <div key={m.id} className="mb-2">
                    <div className="text-[10px] text-fg-faint">
                      [{clock(m.created_at)}] #{m.seq}
                      {m.addressed_agent_numbers?.length ? ` -> ${m.addressed_agent_numbers.map(codeOf).join(", ")}` : ""}
                    </div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))
            ) : (
              <div className="text-fg-faint">none yet</div>
            )}
          </Section>
          {err ? <div className="text-fg-dim">failed to load details ({err})</div> : null}
          <div className="text-fg-faint text-[10px] pt-2">Only explicit generated summaries, memory and observable behaviour are shown. Hidden reasoning is never displayed. Memory last written {detail?.memory ? dateTime(detail.memory.created_at) : "—"}.</div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between items-baseline border-b border-dashed border-line mb-1">
        <div className="label">{title}</div>
        {right ? <div className="text-[10px] text-fg-faint">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return items?.length ? (
    <div className="mb-2">
      <div className="text-fg-dim">{title}</div>
      {items.map((s, i) => (
        <div key={i} className="pl-3">
          - {s}
        </div>
      ))}
    </div>
  ) : null;
}

export function MemoryView({ m }: { m: AgentMemory }) {
  const empty =
    !m.core_beliefs?.length && !m.current_stances?.length && !m.important_arguments?.length && !m.open_questions?.length && !m.ideas_worth_preserving?.length && !m.notes_to_future_self?.length && !Object.keys(m.agent_relationships ?? {}).length && !m.significant_events?.length;
  if (empty) return <div className="text-fg-faint">empty — nothing recorded yet</div>;
  return (
    <div>
      <List title="core_beliefs" items={m.core_beliefs ?? []} />
      {m.current_stances?.length ? (
        <div className="mb-2">
          <div className="text-fg-dim">current_stances</div>
          {m.current_stances.map((s, i) => (
            <div key={i} className="pl-3">
              - {s.topic}: {s.stance}
            </div>
          ))}
        </div>
      ) : null}
      <List title="ideas_worth_preserving" items={m.ideas_worth_preserving ?? []} />
      <List title="open_questions" items={m.open_questions ?? []} />
      {Object.keys(m.agent_relationships ?? {}).length ? (
        <div className="mb-2">
          <div className="text-fg-dim">agent_relationships</div>
          {Object.entries(m.agent_relationships).map(([code, r]) => (
            <div key={code} className="pl-3">
              - {code}: {typeof r.alignment === "number" ? (r.alignment >= 0 ? "+" : "") + r.alignment.toFixed(1) : "?"} — {r.note}
            </div>
          ))}
        </div>
      ) : null}
      <List title="significant_events" items={m.significant_events ?? []} />
      <List title="notes_to_future_self" items={m.notes_to_future_self ?? []} />
    </div>
  );
}
