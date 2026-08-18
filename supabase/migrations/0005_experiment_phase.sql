alter table public.experiments
  add column if not exists phase text not null default 'discussion' check (phase in ('discussion','final_memory','done')),
  add column if not exists last_tag_seq int not null default 0,
  add column if not exists last_judge_seq int not null default 0,
  add column if not exists last_topic_seq int not null default 0,
  add column if not exists last_agent_message_at timestamptz;
