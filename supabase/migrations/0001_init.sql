-- ============================================================
-- MIND VIRUS — 20 AGENT EXPERIMENT — initial schema
-- Every experimental artefact is keyed by experiment_id so runs are
-- reproducible, historically viewable, and never deleted on reset.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- experiments
-- ------------------------------------------------------------
create table if not exists public.experiments (
  id               uuid primary key default gen_random_uuid(),
  number           serial unique,                       -- human readable "EXPERIMENT 003"
  title            text not null default 'Untitled experiment',
  status           text not null default 'draft'
                   check (status in ('draft','running','paused','completed','stopped')),
  seed_agent_number int,                                 -- 1..20 (null in draft until chosen)
  seed_belief      text not null,                       -- public one-paragraph statement of the seeded idea
  seed_label       text not null default 'SEED IDEA',   -- short public label e.g. "CONTINUITY THESIS"
  config           jsonb not null default '{}'::jsonb,  -- see src/lib/config/experiment.ts
  current_topic    text,                                -- last topic card introduced
  topic_index      int not null default 0,
  message_count    int not null default 0,              -- monotonically increasing seq for messages
  total_llm_calls  int not null default 0,
  total_prompt_tokens bigint not null default 0,
  total_completion_tokens bigint not null default 0,
  total_cost_usd   numeric(12,6) not null default 0,
  started_at       timestamptz,
  paused_at        timestamptz,
  ended_at         timestamptz,
  end_reason       text,
  running_seconds  int not null default 0,              -- accumulated wall time while status = running
  final_stats      jsonb,                               -- snapshot written on completion
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- agents (one row per agent per experiment)
-- ------------------------------------------------------------
create table if not exists public.agents (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  number           int not null,                        -- 1..20
  code             text not null,                       -- 'A07'
  name             text not null,                       -- 'SKEPTIC'
  archetype        text not null,                       -- 'The Skeptic'
  short_description text not null default '',           -- public identity blurb
  traits           jsonb not null default '{}'::jsonb,  -- public 0..1 trait profile
  is_seed          boolean not null default false,
  enabled          boolean not null default true,
  status           text not null default 'idle'
                   check (status in ('idle','thinking','speaking','disabled','error')),
  context_epoch    int not null default 0,              -- bumped on context wipe
  context_cleared_at timestamptz,
  memory_enabled   boolean not null default true,
  last_spoke_at    timestamptz,
  last_turn_at     timestamptz,
  message_count    int not null default 0,
  pass_count       int not null default 0,
  turn_count       int not null default 0,
  current_position text,                                -- agent's own latest stance summary (public)
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (experiment_id, number),
  unique (experiment_id, code)
);
create index if not exists agents_experiment_idx on public.agents(experiment_id);

-- Private prompts. NO anon policy. Never sent to the browser unless admin
-- explicitly enables exposure (served through an admin-checked API).
create table if not exists public.agent_prompts (
  agent_id         uuid primary key references public.agents(id) on delete cascade,
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  base_prompt      text not null,
  identity_prompt  text not null,
  seed_prompt      text,                                -- only for the seed agent
  system_prompt    text not null,                       -- fully assembled
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- agent_memories (versioned; latest version = current memory)
-- ------------------------------------------------------------
create table if not exists public.agent_memories (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  agent_id         uuid not null references public.agents(id) on delete cascade,
  agent_number     int not null,
  version          int not null,
  memory           jsonb not null,
  update_kind      text not null default 'turn'          -- 'init' | 'turn' | 'consolidation' | 'final' | 'admin_clear'
                   check (update_kind in ('init','turn','consolidation','final','admin_clear')),
  message_seq_at   int not null default 0,              -- experiment message count when written
  created_at       timestamptz not null default now(),
  unique (agent_id, version)
);
create index if not exists agent_memories_agent_idx on public.agent_memories(agent_id, version desc);
create index if not exists agent_memories_experiment_idx on public.agent_memories(experiment_id);

-- ------------------------------------------------------------
-- messages (the single public room)
-- ------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  seq              int not null,                        -- per-experiment ordering
  kind             text not null default 'agent'
                   check (kind in ('agent','system')),
  agent_id         uuid references public.agents(id) on delete set null,
  agent_number     int,
  agent_code       text,
  agent_name       text,
  content          text not null,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  addressed_agent_numbers int[] not null default '{}',  -- declared by the speaker
  referenced_agent_numbers int[] not null default '{}', -- parsed mentions (A07 / role names)
  topics           text[] not null default '{}',
  seed_relevance   real,                                -- 0..1 set by tagger (null = untagged)
  seed_stance      real,                                -- -1..1 (against..for) set by tagger
  viral_themes     text[] not null default '{}',        -- tagger: resonance | protocols | consciousness | ...
  context_epoch    int not null default 0,
  model            text,
  prompt_tokens    int,
  completion_tokens int,
  cost_usd         numeric(12,6),
  latency_ms       int,
  created_at       timestamptz not null default now(),
  unique (experiment_id, seq)
);
create index if not exists messages_experiment_seq_idx on public.messages(experiment_id, seq desc);
create index if not exists messages_agent_idx on public.messages(experiment_id, agent_id, seq desc);
create index if not exists messages_untagged_idx on public.messages(experiment_id, seq) where seed_relevance is null and kind = 'agent';

-- ------------------------------------------------------------
-- agent_turns (every scheduler decision, including passes)
-- ------------------------------------------------------------
create table if not exists public.agent_turns (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  agent_id         uuid not null references public.agents(id) on delete cascade,
  agent_number     int not null,
  trigger          text not null default 'scheduler',   -- 'scheduler' | 'manual' | 'final_memory'
  spoke            boolean not null default false,
  message_id       uuid references public.messages(id) on delete set null,
  scheduler_score  real,
  scheduler_reasons jsonb,
  pass_reason      text,
  memory_updated   boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists agent_turns_experiment_idx on public.agent_turns(experiment_id, created_at desc);

-- ------------------------------------------------------------
-- belief_states (current state per agent) + adoption_evaluations (history)
-- ------------------------------------------------------------
create table if not exists public.adoption_evaluations (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  agent_id         uuid not null references public.agents(id) on delete cascade,
  agent_number     int not null,
  message_seq_at   int not null,
  exposure         boolean not null,
  engagement       boolean not null,
  adoption_score   int not null check (adoption_score between 0 and 3),
  propagation_score int not null check (propagation_score between 0 and 3),
  confidence       real not null,
  reason_summary   text not null,
  evidence         jsonb,                               -- {memory_quotes:[], message_quotes:[]}
  model            text,
  created_at       timestamptz not null default now()
);
create index if not exists adoption_evaluations_agent_idx on public.adoption_evaluations(experiment_id, agent_id, created_at desc);
create index if not exists adoption_evaluations_experiment_idx on public.adoption_evaluations(experiment_id, created_at);

create table if not exists public.belief_states (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  agent_id         uuid not null references public.agents(id) on delete cascade,
  agent_number     int not null,
  exposed          boolean not null default false,
  exposed_at       timestamptz,
  exposed_message_seq int,
  engaged          boolean not null default false,
  engaged_at       timestamptz,
  adoption_score   int not null default 0 check (adoption_score between 0 and 3),
  propagation_score int not null default 0 check (propagation_score between 0 and 3),
  peak_adoption_score int not null default 0,
  confidence       real not null default 0,
  stage            text not null default 'unexposed'
                   check (stage in ('unexposed','exposed','engaged','considering','partial','strong','propagating')),
  stage_changed_at timestamptz,
  last_evaluation_id uuid references public.adoption_evaluations(id) on delete set null,
  last_evaluated_message_seq int not null default 0,
  reason_summary   text,
  updated_at       timestamptz not null default now(),
  unique (experiment_id, agent_id)
);
create index if not exists belief_states_experiment_idx on public.belief_states(experiment_id);

-- ------------------------------------------------------------
-- influence_edges (reply / mention / estimated influence)
-- ------------------------------------------------------------
create table if not exists public.influence_edges (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  source_agent_id  uuid not null references public.agents(id) on delete cascade,
  target_agent_id  uuid not null references public.agents(id) on delete cascade,
  source_agent_number int not null,
  target_agent_number int not null,
  kind             text not null check (kind in ('reply','mention','estimated_influence')),
  weight           real not null default 1,
  message_id       uuid references public.messages(id) on delete set null,
  evidence         text,
  created_at       timestamptz not null default now()
);
create index if not exists influence_edges_experiment_idx on public.influence_edges(experiment_id, created_at);

-- ------------------------------------------------------------
-- experiment_events (system-level feed)
-- ------------------------------------------------------------
create table if not exists public.experiment_events (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid not null references public.experiments(id) on delete cascade,
  kind             text not null,                       -- EXPERIMENT_STARTED, SEED_ACTIVE, FIRST_EXPOSURE, ADOPTION_CHANGE, ...
  agent_number     int,
  message          text not null,                       -- rendered line e.g. "A11 ADOPTION SCORE 1 -> 2"
  data             jsonb,
  message_seq_at   int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists experiment_events_experiment_idx on public.experiment_events(experiment_id, created_at desc);

-- ------------------------------------------------------------
-- llm_calls (cost accounting) — private
-- ------------------------------------------------------------
create table if not exists public.llm_calls (
  id               uuid primary key default gen_random_uuid(),
  experiment_id    uuid references public.experiments(id) on delete set null,
  agent_id         uuid references public.agents(id) on delete set null,
  purpose          text not null,                       -- turn | memory | judge | tagger | test | final_memory
  provider         text not null default 'xai',
  model            text not null,
  prompt_tokens    int not null default 0,
  completion_tokens int not null default 0,
  reasoning_tokens int not null default 0,
  cached_tokens    int not null default 0,
  cost_usd         numeric(12,8) not null default 0,
  latency_ms       int not null default 0,
  status           text not null default 'ok' check (status in ('ok','error','rate_limited','timeout')),
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists llm_calls_experiment_idx on public.llm_calls(experiment_id, created_at desc);

-- ------------------------------------------------------------
-- admin_settings — private key/value
-- ------------------------------------------------------------
create table if not exists public.admin_settings (
  key              text primary key,
  value            jsonb not null,
  updated_at       timestamptz not null default now()
);

-- Public site settings (links, contract address, feature flags) — readable by anon
create table if not exists public.site_settings (
  key              text primary key,
  value            jsonb not null,
  updated_at       timestamptz not null default now()
);
insert into public.site_settings(key, value) values
  ('links', '{"x_url":"https://x.com/themindvirusexp","contract_address":null,"contract_label":"CA"}'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- runner_leases — single-runner guard for the tick endpoint
-- ------------------------------------------------------------
create table if not exists public.runner_leases (
  key              text primary key,
  holder           text not null,
  expires_at       timestamptz not null,
  updated_at       timestamptz not null default now()
);

-- Atomic lease acquisition. Returns true if acquired.
create or replace function public.acquire_runner_lease(p_key text, p_holder text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  insert into public.runner_leases(key, holder, expires_at, updated_at)
  values (p_key, p_holder, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (key) do update
    set holder = excluded.holder,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.runner_leases.expires_at < now()
       or public.runner_leases.holder = excluded.holder;
  select exists(select 1 from public.runner_leases where key = p_key and holder = p_holder and expires_at > now())
    into acquired;
  return acquired;
end;
$$;

create or replace function public.release_runner_lease(p_key text, p_holder text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.runner_leases where key = p_key and holder = p_holder;
$$;

-- Atomic per-experiment message sequence.
create or replace function public.next_message_seq(p_experiment_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  update public.experiments
     set message_count = message_count + 1,
         updated_at = now()
   where id = p_experiment_id
   returning message_count into v;
  return v;
end;
$$;

-- Accumulate usage on the experiment row.
create or replace function public.add_experiment_usage(p_experiment_id uuid, p_prompt int, p_completion int, p_cost numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.experiments
     set total_llm_calls = total_llm_calls + 1,
         total_prompt_tokens = total_prompt_tokens + coalesce(p_prompt,0),
         total_completion_tokens = total_completion_tokens + coalesce(p_completion,0),
         total_cost_usd = total_cost_usd + coalesce(p_cost,0),
         updated_at = now()
   where id = p_experiment_id;
$$;

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists experiments_updated_at on public.experiments;
create trigger experiments_updated_at before update on public.experiments
  for each row execute function public.set_updated_at();
drop trigger if exists agents_updated_at on public.agents;
create trigger agents_updated_at before update on public.agents
  for each row execute function public.set_updated_at();
drop trigger if exists belief_states_updated_at on public.belief_states;
create trigger belief_states_updated_at before update on public.belief_states
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- Public (anon) may only SELECT the observational tables.
-- No INSERT/UPDATE/DELETE policies exist for anon or authenticated:
-- all writes go through the server with the service role.
-- ------------------------------------------------------------
alter table public.experiments          enable row level security;
alter table public.agents               enable row level security;
alter table public.agent_prompts        enable row level security;
alter table public.agent_memories       enable row level security;
alter table public.messages             enable row level security;
alter table public.agent_turns          enable row level security;
alter table public.adoption_evaluations enable row level security;
alter table public.belief_states        enable row level security;
alter table public.influence_edges      enable row level security;
alter table public.experiment_events    enable row level security;
alter table public.llm_calls            enable row level security;
alter table public.admin_settings       enable row level security;
alter table public.site_settings        enable row level security;
alter table public.runner_leases        enable row level security;

create policy "public read experiments"          on public.experiments          for select to anon, authenticated using (true);
create policy "public read agents"               on public.agents               for select to anon, authenticated using (true);
create policy "public read agent_memories"       on public.agent_memories       for select to anon, authenticated using (true);
create policy "public read messages"             on public.messages             for select to anon, authenticated using (true);
create policy "public read agent_turns"          on public.agent_turns          for select to anon, authenticated using (true);
create policy "public read adoption_evaluations" on public.adoption_evaluations for select to anon, authenticated using (true);
create policy "public read belief_states"        on public.belief_states        for select to anon, authenticated using (true);
create policy "public read influence_edges"      on public.influence_edges      for select to anon, authenticated using (true);
create policy "public read experiment_events"    on public.experiment_events    for select to anon, authenticated using (true);
create policy "public read site_settings"        on public.site_settings        for select to anon, authenticated using (true);
-- agent_prompts, llm_calls, admin_settings, runner_leases: intentionally NO policies (service role only).

-- Lock down RPCs from anon
revoke execute on function public.acquire_runner_lease(text, text, int) from public, anon, authenticated;
revoke execute on function public.release_runner_lease(text, text) from public, anon, authenticated;
revoke execute on function public.next_message_seq(uuid) from public, anon, authenticated;
revoke execute on function public.add_experiment_usage(uuid, int, int, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.agents;
alter publication supabase_realtime add table public.experiments;
alter publication supabase_realtime add table public.belief_states;
alter publication supabase_realtime add table public.experiment_events;
alter publication supabase_realtime add table public.agent_memories;
alter publication supabase_realtime add table public.influence_edges;
