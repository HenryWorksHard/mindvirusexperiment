"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminState } from "@/lib/admin-data";
import type { ExperimentConfig } from "@/lib/config/experiment";
import type { AgentRow } from "@/lib/types";
import { Panel, Row } from "@/components/ui/Panel";
import { AgentInspector } from "@/components/live/AgentInspector";
import { clock, dateTime, expNo, usd, compact } from "@/lib/format";

type Cfg = ExperimentConfig;

async function api<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export function AdminConsole() {
  const [state, setState] = useState<AdminState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inspect, setInspect] = useState<AgentRow | null>(null);
  const [promptView, setPromptView] = useState<{ agent: AgentRow; text: string } | null>(null);
  const [tickReport, setTickReport] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const s = await api<AdminState>("/api/admin/state", undefined, "GET");
      setState(s);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 10_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(`${label}: ok`);
      await load();
      return r;
    } catch (e) {
      setErr(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const cur = state?.current ?? null;
  const cfg = useMemo(() => (cur?.config ?? state?.defaults.config ?? {}) as Cfg, [cur, state]);

  if (!state) {
    return <div className="min-h-dvh flex items-center justify-center text-fg-dim tracking-[0.2em] text-[11px]">{err ? `ERROR: ${err}` : "LOADING CONTROL PANEL…"}</div>;
  }

  const isLive = cur?.status === "running" || cur?.status === "paused";
  const isDraft = cur?.status === "draft";

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-dashed border-line px-4 py-2 flex items-center justify-between gap-3 flex-wrap text-[11px] tracking-[0.15em]">
        <div className="flex items-center gap-4">
          <span className="font-bold tracking-[0.25em] text-[14px]">MIND VIRUS</span>
          <span className="inv px-1">ADMIN</span>
          <Link href="/" className="text-fg-dim">
            VIEW SITE
          </Link>
          <Link href="/experiments" className="text-fg-dim">
            ARCHIVE
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn text-[10px] py-[2px]"
            disabled={!!busy}
            onClick={() =>
              run("tick", async () => {
                const r = await api<Record<string, unknown>>("/api/admin/tick");
                setTickReport(JSON.stringify(r));
              })
            }
            title="Run one orchestration tick now"
          >
            KICK TICK
          </button>
          <button className="btn text-[10px] py-[2px]" onClick={() => api("/api/admin/logout").then(() => router.push("/admin/login"))}>
            LOGOUT
          </button>
        </div>
      </header>

      {(err || msg) && (
        <div className={`px-4 py-1 text-[11px] border-b border-dashed border-line ${err ? "text-fg" : "text-fg-dim"}`}>
          {err ? `! ${err}` : msg}
          {tickReport ? <span className="text-fg-faint ml-3 break-all">{tickReport.slice(0, 400)}</span> : null}
        </div>
      )}

      <main className="flex-1 p-4 grid gap-4 grid-cols-1 xl:grid-cols-[1.1fr_1fr]">
        {/* ---------- Experiment control ---------- */}
        <Panel title={`EXPERIMENT ${expNo(cur?.number)} — ${cur ? cur.status.toUpperCase() : "NONE"}`}>
          <div className="p-3 text-[11px] space-y-3">
            {cur ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <button className="btn" disabled={!!busy || cur.status !== "draft"} onClick={() => run("start", () => api(`/api/admin/experiment/${cur.id}`, { action: "start" }))}>
                    START
                  </button>
                  <button className="btn" disabled={!!busy || cur.status !== "running"} onClick={() => run("pause", () => api(`/api/admin/experiment/${cur.id}`, { action: "pause" }))}>
                    PAUSE
                  </button>
                  <button className="btn" disabled={!!busy || cur.status !== "paused"} onClick={() => run("resume", () => api(`/api/admin/experiment/${cur.id}`, { action: "resume" }))}>
                    RESUME
                  </button>
                  <button
                    className="btn"
                    disabled={!!busy || !isLive}
                    onClick={() => confirm("Stop this experiment? It will be archived as STOPPED.") && run("stop", () => api(`/api/admin/experiment/${cur.id}`, { action: "stop" }))}
                  >
                    STOP
                  </button>
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() =>
                      confirm("Reset: archive this experiment (stop if live) and create a fresh draft with the same seed + config. Nothing is deleted.") &&
                      run("reset", () => api(`/api/admin/experiment/${cur.id}`, { action: "reset" }))
                    }
                  >
                    RESET
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-6">
                  <Row k="TITLE" v={cur.title} />
                  <Row k="PHASE" v={cur.phase} />
                  <Row k="MESSAGES" v={`${cur.message_count} / ${cfg.max_messages}`} />
                  <Row k="COST" v={`${usd(cur.total_cost_usd)} / $${cfg.budget_usd}`} />
                  <Row k="LLM CALLS" v={cur.total_llm_calls} />
                  <Row k="STARTED" v={dateTime(cur.started_at)} />
                  <Row k="SEED" v={`A${String(cur.seed_agent_number ?? 0).padStart(2, "0")}`} />
                  <Row k="TOPIC #" v={cur.topic_index} />
                </div>
              </>
            ) : (
              <div className="text-fg-dim">No experiment yet. Create a draft below.</div>
            )}
            <hr className="hr-dash" />
            <div className="flex flex-wrap gap-2 items-center">
              <span className="label">NEW DRAFT</span>
              <button
                className="btn"
                disabled={!!busy || isLive}
                onClick={() => run("create 20-agent draft", () => api("/api/admin/experiment", { config: { ...state.defaults.config } }))}
                title={isLive ? "Stop the live experiment first" : "20 agents, production defaults"}
              >
                20 AGENTS (DEFAULT)
              </button>
              <button
                className="btn"
                disabled={!!busy || isLive}
                onClick={() => run("create test draft", () => api("/api/admin/experiment", { title: "test mode run", config: { ...state.defaults.testConfig } }))}
                title="3 agents, 20 messages, small tokens"
              >
                TEST MODE (3 AGENTS)
              </button>
              {state.defaults.testModeEnv ? <span className="text-fg-faint">TEST_MODE=true in env</span> : null}
            </div>
          </div>
        </Panel>

        {/* ---------- Config ---------- */}
        <Panel title={isDraft ? "CONFIGURATION (DRAFT — EDITABLE)" : isLive ? "CONFIGURATION (LIVE — LIMITS EDITABLE)" : "CONFIGURATION (READ ONLY)"}>
          {cur ? <ConfigForm key={cur.id + cur.status} state={state} onSaved={load} busy={busy} setBusy={setBusy} setErr={setErr} setMsg={setMsg} /> : <div className="p-3 text-fg-dim text-[11px]">Create a draft first.</div>}
        </Panel>

        {/* ---------- Agents ---------- */}
        <Panel title={`AGENTS (${state.agents.length})`} className="xl:col-span-2">
          <div className="p-2 overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead className="text-fg-dim text-left">
                <tr>
                  <th className="py-1 pr-2">AGENT</th>
                  <th className="pr-2">STATUS</th>
                  <th className="pr-2 text-right">MSGS</th>
                  <th className="pr-2 text-right">PASS</th>
                  <th className="pr-2">LAST</th>
                  <th className="pr-2">ADOPT</th>
                  <th className="pr-2">PROP</th>
                  <th className="pr-2">STAGE</th>
                  <th className="pr-2">EPOCH</th>
                  <th className="pr-2">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {state.agents.map((a) => {
                  const b = state.beliefs.find((x) => x.agent_id === a.id);
                  return (
                    <tr key={a.id} className="border-t border-dashed border-line">
                      <td className="py-1 pr-2 whitespace-nowrap">
                        <button className="hover:underline" onClick={() => setInspect(a)}>
                          {a.code} / {a.name}
                        </button>
                        {a.is_seed ? <span className="inv px-1 ml-1">SEED</span> : null}
                        {a.last_error ? (
                          <span className="text-fg-faint ml-1" title={a.last_error}>
                            [ERR]
                          </span>
                        ) : null}
                      </td>
                      <td className="pr-2">{a.enabled ? a.status : "disabled"}</td>
                      <td className="pr-2 text-right">{a.message_count}</td>
                      <td className="pr-2 text-right">{a.pass_count}</td>
                      <td className="pr-2">{a.last_spoke_at ? clock(a.last_spoke_at) : "—"}</td>
                      <td className="pr-2">{a.is_seed ? "seed" : b?.adoption_score ?? 0}</td>
                      <td className="pr-2">{a.is_seed ? "seed" : b?.propagation_score ?? 0}</td>
                      <td className="pr-2">{a.is_seed ? "—" : b?.stage ?? "—"}</td>
                      <td className="pr-2">{a.context_epoch}</td>
                      <td className="pr-2 whitespace-nowrap">
                        <div className="flex gap-1 flex-wrap">
                          <button className="btn text-[9px] py-0 px-1" disabled={!!busy || !isLive || !a.enabled} onClick={() => run(`turn ${a.code}`, () => api(`/api/admin/agent/${a.id}`, { action: "turn" }))}>
                            TURN
                          </button>
                          <button className="btn text-[9px] py-0 px-1" disabled={!!busy || a.is_seed} onClick={() => run(`${a.enabled ? "disable" : "enable"} ${a.code}`, () => api(`/api/admin/agent/${a.id}`, { action: a.enabled ? "disable" : "enable" }))}>
                            {a.enabled ? "DISABLE" : "ENABLE"}
                          </button>
                          <button className="btn text-[9px] py-0 px-1" disabled={!!busy} onClick={() => confirm(`Wipe ${a.code}'s conversational context? Memory is preserved.`) && run(`clear context ${a.code}`, () => api(`/api/admin/agent/${a.id}`, { action: "clear-context" }))}>
                            WIPE CTX
                          </button>
                          <button className="btn text-[9px] py-0 px-1" disabled={!!busy} onClick={() => confirm(`Erase ${a.code}'s persistent memory? This writes a new empty version (history kept).`) && run(`clear memory ${a.code}`, () => api(`/api/admin/agent/${a.id}`, { action: "clear-memory" }))}>
                            CLEAR MEM
                          </button>
                          <button
                            className="btn text-[9px] py-0 px-1"
                            disabled={!!busy}
                            onClick={() =>
                              run(`prompt ${a.code}`, async () => {
                                const p = await api<{ system_prompt: string }>(`/api/admin/agent/${a.id}`, undefined, "GET");
                                setPromptView({ agent: a, text: p.system_prompt });
                              })
                            }
                          >
                            PROMPT
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* ---------- Runner + usage ---------- */}
        <Panel title="RUNNER / API USAGE">
          <div className="p-3 text-[11px] space-y-3">
            <div>
              <Row k="RUNNER SECRET" v={state.env.runnerConfigured ? "configured" : "MISSING"} />
              <Row k="LEASE HOLDER" v={state.lease ? `${state.lease.holder} (until ${clock(state.lease.expires_at)})` : "idle"} />
              <Row k="APP_URL" v={state.env.appUrl || "—"} dim />
              <div className="text-fg-faint mt-1">
                Production heartbeat: Supabase pg_cron POSTs /api/runner/tick every 10s (see README). Dev: <code>npm run runner</code>. Nothing runs unless an experiment is RUNNING.
              </div>
            </div>
            <hr className="hr-dash" />
            <div>
              <div className="label mb-1">USAGE (CURRENT EXPERIMENT)</div>
              <Row k="CALLS / ERRORS" v={`${state.usage.total.calls} / ${state.usage.total.errors}`} />
              <Row k="INPUT TOKENS" v={compact(state.usage.total.prompt_tokens)} />
              <Row k="OUTPUT TOKENS" v={`${compact(state.usage.total.completion_tokens)} (+${compact(state.usage.total.reasoning_tokens)} reasoning)`} />
              <Row k="COST" v={usd(state.usage.total.cost_usd)} />
              <Row k="LAST 24H COST" v={usd(state.usage.last24hCost)} />
              <div className="mt-2 grid grid-cols-2 gap-x-4">
                <div>
                  <div className="label">BY PURPOSE</div>
                  {Object.entries(state.usage.byPurpose).map(([k, v]) => (
                    <Row key={k} k={k} v={`${v.calls} · ${usd(v.cost_usd)}`} />
                  ))}
                </div>
                <div>
                  <div className="label">BY MODEL</div>
                  {Object.entries(state.usage.byModel).map(([k, v]) => (
                    <Row key={k} k={k} v={`${v.calls} · ${usd(v.cost_usd)}`} />
                  ))}
                </div>
              </div>
              {state.usage.recentErrors.length ? (
                <div className="mt-2">
                  <div className="label">RECENT ERRORS</div>
                  {state.usage.recentErrors.map((e, i) => (
                    <div key={i} className="text-fg-dim truncate" title={e.error ?? ""}>
                      [{clock(e.created_at)}] {e.purpose} {e.model} {e.status}: {e.error}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        {/* ---------- Site settings + archive ---------- */}
        <Panel title="SITE SETTINGS / ARCHIVE">
          <div className="p-3 text-[11px] space-y-3">
            <SiteSettingsForm links={state.links} onSaved={load} run={run} busy={busy} />
            <hr className="hr-dash" />
            <div>
              <div className="label mb-1">EXPERIMENTS</div>
              <div className="max-h-56 overflow-y-auto">
                {state.experiments.map((e) => (
                  <div key={e.id} className="flex justify-between gap-2 dashed-row py-[2px]">
                    <Link href={`/experiments/${e.number}`} className="hover:underline">
                      {expNo(e.number)} {e.title}
                    </Link>
                    <span className="text-fg-dim">
                      {e.status} · {e.message_count} msgs · {usd(e.total_cost_usd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </main>

      {inspect ? <AgentInspector key={inspect.id} agent={inspect} agents={state.agents} onClose={() => setInspect(null)} onSelectAgent={setInspect} /> : null}
      {promptView ? (
        <div className="fixed inset-0 z-50 flex" role="dialog">
          <div className="flex-1 bg-black/70" onClick={() => setPromptView(null)} />
          <div className="w-full max-w-[720px] h-full bg-bg border-l border-dashed border-line overflow-y-auto">
            <div className="sticky top-0 bg-bg border-b border-dashed border-line px-4 py-2 flex justify-between items-center text-[11px] tracking-widest">
              <span>
                SYSTEM PROMPT — {promptView.agent.code} / {promptView.agent.name} (ADMIN ONLY)
              </span>
              <button className="btn text-[10px] py-[2px]" onClick={() => setPromptView(null)}>
                CLOSE
              </button>
            </div>
            <pre className="p-4 text-[11px] whitespace-pre-wrap leading-[1.5]">{promptView.text}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-[2px]">{children}</div>
      {hint ? <div className="text-[9.5px] text-fg-faint mt-[1px]">{hint}</div> : null}
    </label>
  );
}

function ConfigForm({
  state,
  onSaved,
  busy,
  setBusy,
  setErr,
  setMsg,
}: {
  state: AdminState;
  onSaved: () => Promise<void>;
  busy: string | null;
  setBusy: (s: string | null) => void;
  setErr: (s: string | null) => void;
  setMsg: (s: string | null) => void;
}) {
  const cur = state.current!;
  const isDraft = cur.status === "draft";
  const isLive = cur.status === "running" || cur.status === "paused";
  const [cfg, setCfg] = useState<Cfg>({ ...(cur.config as Cfg) });
  const [seedBelief, setSeedBelief] = useState(cur.seed_belief);
  const [seedLabel, setSeedLabel] = useState(cur.seed_label);
  const [title, setTitle] = useState(cur.title);
  const editable = isDraft || isLive;

  const num = (k: keyof Cfg, step = 1, min?: number, max?: number) => (
    <input
      className="input"
      type="number"
      step={step}
      min={min}
      max={max}
      value={String(cfg[k] ?? "")}
      disabled={!editable}
      onChange={(e) => setCfg({ ...cfg, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}
    />
  );
  const bool = (k: keyof Cfg) => (
    <select className="select" value={String(cfg[k])} disabled={!isDraft && k !== "final_memory_write"} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value === "true" })}>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
  const modelSel = (k: "model" | "judge_model") => (
    <select className="select" value={cfg[k]} disabled={!editable} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}>
      {state.models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} — ${m.inputPerMTok}/${m.outputPerMTok} per M
        </option>
      ))}
    </select>
  );

  const save = async () => {
    setBusy("save config");
    setErr(null);
    try {
      if (isDraft) {
        await api(`/api/admin/experiment/${cur.id}`, { action: "update", title, seed_belief: seedBelief, seed_label: seedLabel, config: cfg });
      } else {
        await api(`/api/admin/experiment/${cur.id}`, { action: "live-config", config: cfg });
      }
      setMsg("configuration saved");
      await onSaved();
    } catch (e) {
      setErr(`save: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleAgent = (n: number) => {
    const set = new Set(cfg.agent_numbers);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    if (!set.has(cfg.seed_agent_number)) set.add(cfg.seed_agent_number);
    setCfg({ ...cfg, agent_numbers: [...set].sort((a, b) => a - b) });
  };

  return (
    <div className="p-3 text-[11px] space-y-3">
      {isDraft ? (
        <>
          <Field label="TITLE">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <Field label="SEED BELIEF (given only to the seed agent)">
              <textarea className="textarea" value={seedBelief} onChange={(e) => setSeedBelief(e.target.value)} />
            </Field>
            <Field label="SEED LABEL">
              <input className="input" value={seedLabel} onChange={(e) => setSeedLabel(e.target.value)} />
            </Field>
          </div>
          <Field label="SEED AGENT">
            <select className="select" value={cfg.seed_agent_number} onChange={(e) => setCfg({ ...cfg, seed_agent_number: Number(e.target.value), agent_numbers: [...new Set([...cfg.agent_numbers, Number(e.target.value)])].sort((a, b) => a - b) })}>
              {state.personas.map((p) => (
                <option key={p.number} value={p.number}>
                  {p.code} / {p.name} — {p.archetype}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="label">AGENTS IN ROOM ({cfg.agent_numbers.length})</span>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-2 gap-y-[2px] mt-1">
              {state.personas.map((p) => (
                <label key={p.number} className="flex items-center gap-1 text-[10px] cursor-pointer" title={p.short_description}>
                  <input type="checkbox" checked={cfg.agent_numbers.includes(p.number)} disabled={p.number === cfg.seed_agent_number} onChange={() => toggleAgent(p.number)} />
                  <span className={p.number === cfg.seed_agent_number ? "inv px-1" : ""}>{p.code}</span>
                  <span className="text-fg-dim truncate">{p.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-1 flex gap-2">
              <button className="btn text-[9px] py-0" onClick={() => setCfg({ ...cfg, agent_numbers: state.personas.map((p) => p.number) })}>
                ALL 20
              </button>
              <button className="btn text-[9px] py-0" onClick={() => setCfg({ ...cfg, agent_numbers: [...new Set([3, 9, cfg.seed_agent_number])].sort((a, b) => a - b) })}>
                TEST 3
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-fg-dim">
          Seed: <span className="text-fg">{cur.seed_label}</span> — {cur.seed_belief}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="MODEL (agents)">{modelSel("model")}</Field>
        <Field label="JUDGE MODEL">{modelSel("judge_model")}</Field>
        <Field label="TEMPERATURE">{num("temperature", 0.05, 0, 2)}</Field>
        <Field label="MAX TOKENS / RESPONSE">{num("max_tokens_per_response", 10, 64, 4000)}</Field>
        <Field label="MESSAGES / MINUTE" hint="conversation speed">
          {num("messages_per_minute", 0.5, 0.2, 30)}
        </Field>
        <Field label="MAX MESSAGES" hint="experiment completes">
          {num("max_messages", 10, 1, 5000)}
        </Field>
        <Field label="BUDGET USD" hint="experiment completes">
          {num("budget_usd", 1, 0.1, 1000)}
        </Field>
        <Field label="AGENT COOLDOWN (s)">{num("agent_cooldown_seconds", 5, 0, 3600)}</Field>
        <Field label="TURNS / TICK">{num("turns_per_tick", 1, 1, 6)}</Field>
        <Field label="CONTEXT WINDOW (msgs)">{num("context_window_messages", 1, 4, 80)}</Field>
        <Field label="RETRIEVED MENTIONS">{num("retrieved_mentions", 1, 0, 12)}</Field>
        <Field label="MAX CONSECUTIVE">{num("max_consecutive_messages_per_agent", 1, 1, 5)}</Field>
        <Field label="MEMORY ENABLED">{bool("memory_enabled")}</Field>
        <Field label="CONSOLIDATE EVERY N TURNS">{num("memory_consolidate_every_n_turns", 1, 1, 50)}</Field>
        <Field label="FINAL MEMORY WRITE">{bool("final_memory_write")}</Field>
        <Field label="JUDGE EVERY N MSGS">{num("judge_every_n_messages", 1, 1, 100)}</Field>
        <Field label="TAG EVERY N MSGS">{num("tag_every_n_messages", 1, 1, 100)}</Field>
        <Field label="TOPIC EVERY N MSGS" hint="0 = only opening prompt">
          {num("topic_rotation_every_n_messages", 5, 0, 500)}
        </Field>
      </div>
      <div className="flex gap-2 items-center">
        <button className="btn" disabled={!!busy || !editable} onClick={save}>
          {isDraft ? "SAVE DRAFT" : "APPLY LIVE CHANGES"}
        </button>
        {isDraft ? <span className="text-fg-faint">Saving a draft re-instantiates its agents and prompts.</span> : isLive ? <span className="text-fg-faint">Model, pace and limits apply from the next tick.</span> : null}
      </div>
    </div>
  );
}

function SiteSettingsForm({ links, onSaved, run, busy }: { links: AdminState["links"]; onSaved: () => Promise<void>; run: (l: string, f: () => Promise<unknown>) => Promise<unknown>; busy: string | null }) {
  const [x, setX] = useState(links.x_url ?? "");
  const [ca, setCa] = useState(links.contract_address ?? "");
  const [label, setLabel] = useState(links.contract_label ?? "CA");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_80px_auto] gap-2 items-end">
      <label className="block">
        <span className="label">X URL</span>
        <input className="input" value={x} onChange={(e) => setX(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">CONTRACT ADDRESS (shown in footer when set)</span>
        <input className="input" value={ca} onChange={(e) => setCa(e.target.value)} placeholder="paste after launch" />
      </label>
      <label className="block">
        <span className="label">LABEL</span>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button
        className="btn"
        disabled={!!busy}
        onClick={() =>
          run("site settings", async () => {
            await api("/api/admin/site-settings", { x_url: x || null, contract_address: ca || null, contract_label: label || "CA" });
            await onSaved();
          })
        }
      >
        SAVE
      </button>
    </div>
  );
}
