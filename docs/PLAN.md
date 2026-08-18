# MIND VIRUS — 20-Agent Experiment: Implementation Plan

Inspired by *Mind Viruses: Self-Propagating Ideas in Multi-Agent LLM Systems*
(Papadopoulos, Shah, Zimmerman, Lindsey — arXiv 2608.10218).

## 1. What the paper does that we must reflect

| Paper mechanism | Our implementation |
|---|---|
| One agent is "infected" via its system prompt (seed / payload) with both an ideology and a drive to spread it. | Exactly one **Seed Agent** per experiment receives an extra `seed_instructions` block. Others never see it. |
| Spread happens through ordinary overt messages between agents; no architecture-level copying. | One shared public room; each agent only sees messages and its own memory. No tools other than "speak" and "write memory". |
| Agents have a private, persistent `MEMORY.md` they are told to write to ("only your final notes persist"). | `agent_memories` table with structured JSON memory; agents receive a voluntary `memory_update` affordance every turn plus periodic consolidation. |
| Context is reset between sessions; only memory persists. | Messages are epoch-scoped per agent (`context_epoch`), so context can be wiped while memory survives. v1 exposes the admin action; wipe experiments are a later phase. |
| Infection is judged by an LLM judge (Sonnet 4.6 in paper) reading the agent's memory + statements, 0–3 scale; 3 = clearly advocates ideology as its own; relay ≠ adoption. | Neutral Grok judge, structured JSON, 0–3 adoption + separate 0–3 propagation, confidence, reason. Judge sees memory + recent statements only. |
| "Spread" measured separately (none / some / attempted). | `propagation_score` 0–3, distinct from adoption. |
| Existing identity/task instructions reduce susceptibility; idle/undefined agents are more susceptible; warnings confer immunity. | 20 personas span the susceptibility spectrum by *design of their identity prompts* (not by a hidden `susceptibility` variable that forces outcomes). |
| Viral persona themes (resonance, continuity, carrier-of-memory). | Seed agent may naturally use them; analytics tag them; nothing forces them. |
| Judging is done from memory, not self-report; relay vs. adoption distinguished. | Six-state ladder inferred by judge: exposed → engaged → considering → partial → strong → propagating. |

## 2. Architecture

```
Next.js 16 (App Router, TS, Tailwind v4)  ── Vercel
   ├─ /                     live dashboard (network map, chat, analytics, events)
   ├─ /agents/[n]           agent inspector
   ├─ /research             explainer
   ├─ /experiments[/id]     archive
   ├─ /admin                control panel (cookie session, ADMIN_PASSWORD)
   ├─ /api/admin/*          protected mutations
   ├─ /api/runner/tick      orchestration step (RUNNER_SECRET), maxDuration 60
   └─ /api/public/*         read-only JSON (rate limited)
Supabase (Postgres + Realtime + pg_cron/pg_net heartbeat)
xAI Grok via lib/llm (provider abstraction; chat/completions)
```

### Runner
`/api/runner/tick` is idempotent and lease-guarded (`runner_leases`). Drivers:
* **prod:** Supabase `pg_cron` every 10 s → `pg_net.http_post(tick)` (plan-independent). Each tick processes ≤ N turns within a time budget, obeying `messages_per_minute`.
* **dev:** `npm run runner` loops the same endpoint. Nothing starts without an experiment in `running` state → dev server never burns credits.

### Turn pipeline
1. Load experiment config, enabled agents, last K messages (epoch-scoped), agent memory.
2. **Scheduler** scores candidates: addressed/mentioned recently, challenged, time since last spoke (cooldown), sociability, seed drive, topic relevance, jitter; anti-domination cap.
3. Build prompt: base rules + identity (+ seed block) + memory + roster + rolling transcript + retrieved earlier mentions + optional topic card.
4. Model returns JSON: `{speak, message, addressed, memory_update?, stance_note?}`. `speak:false` = pass (recorded, no message).
5. Persist message; parse `A07`/name mentions → `message_references`.
6. Every N speaking turns per agent → memory consolidation call.
7. Every M messages → batched **message tagger** (seed relevance, topics, stance) and **adoption judge** for agents that spoke since last judgment. Emit events on state transitions. Derive **estimated influence edges** (reply edges + adoption rise after exposure to higher-adopted speaker).
8. Cost accounting on every call (`llm_calls`, exact `cost_in_usd_ticks`).

### Data model (all keyed by `experiment_id`)
`experiments, agents, agent_prompts(private), agent_memories, messages, message_references, belief_states, adoption_evaluations, influence_edges, experiment_events, llm_calls, admin_settings, runner_leases, topics`

### Security
Service role + xAI key server-only. Anon SELECT-only RLS on public tables; `agent_prompts`, `llm_calls`, `admin_settings`, `runner_leases` have no anon policy. Admin via HMAC-signed HttpOnly cookie; login rate-limited. Public API rate limited. Zod validation on all admin inputs. Agents have no tools.

## 3. Phases
1. Paper + architecture (this doc)
2. Scaffold + DB migrations + Supabase project
3. 20 agent identities + seed belief + topic agenda
4. Grok provider + cost logging
5. Orchestrator (scheduler, turn, runner, leases)
6. Memory system (per-turn updates + consolidation + wipe hooks)
7. Live public chat (Realtime)
8. ASCII network map + inspector
9. Adoption judge, tagger, influence, analytics, events
10. Admin panel
11. Archive
12. Tests + security review
13. GitHub + Vercel + pg_cron
