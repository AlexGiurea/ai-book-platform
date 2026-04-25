create table if not exists users (
  id text primary key,
  email text not null,
  email_normalized text not null unique,
  name text,
  plan text not null default 'pro',
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_created_at_idx on users (created_at desc);

alter table users
  add column if not exists plan text not null default 'pro';

create table if not exists user_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_idx on user_sessions (user_id);
create index if not exists user_sessions_expires_idx on user_sessions (expires_at);

create table if not exists projects (
  id text primary key,
  user_id text references users(id) on delete cascade,
  plan text not null default 'pro',
  input jsonb not null,
  status text not null,
  target_words integer not null,
  total_words integer not null default 0,
  expected_batches integer not null,
  title text,
  synopsis text,
  bible jsonb,
  cover_status text not null default 'pending',
  cover jsonb,
  cover_error text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_created_at_idx on projects (created_at desc);
create index if not exists projects_status_idx on projects (status);

alter table projects
  add column if not exists user_id text references users(id) on delete cascade;

alter table projects
  add column if not exists plan text not null default 'pro';

create index if not exists projects_user_created_at_idx on projects (user_id, created_at desc);

create table if not exists book_batches (
  project_id text not null references projects(id) on delete cascade,
  batch_number integer not null,
  chapter_number integer,
  chapter_title text,
  chapter_summary text,
  prose text not null,
  word_count integer not null,
  created_at timestamptz not null default now(),
  primary key (project_id, batch_number)
);

create index if not exists book_batches_project_idx on book_batches (project_id, batch_number);

create table if not exists generation_events (
  id bigserial primary key,
  project_id text not null references projects(id) on delete cascade,
  event jsonb not null,
  timestamp timestamptz not null default now()
);

create index if not exists generation_events_project_idx on generation_events (project_id, timestamp);

create table if not exists generation_jobs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  type text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_claim_idx
  on generation_jobs (status, run_after, created_at);

create index if not exists generation_jobs_project_idx
  on generation_jobs (project_id, type, status);
