alter table public.agent_turns
  add column if not exists context_from_seq int,
  add column if not exists context_to_seq int,
  add column if not exists position_summary text;
create index if not exists agent_turns_agent_idx on public.agent_turns(experiment_id, agent_id, created_at desc);
