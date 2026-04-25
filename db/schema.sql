create table if not exists projects (
  id text primary key,
  input jsonb not null,
  status text not null,
  target_words integer not null,
  total_words integer not null default 0,
  expected_batches integer not null,
  title text,
  synopsis text,
  bible jsonb,
  vector_store_id text,
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
  add column if not exists vector_store_id text;

create table if not exists canon_facts (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  category text not null,
  label text not null,
  content text not null,
  source_type text not null,
  source_id text,
  confidence numeric(4, 3) not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canon_facts_project_category_idx
  on canon_facts (project_id, category);

create table if not exists characters (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  role text not null,
  description text not null,
  voice text not null,
  motivation text not null,
  arc text not null,
  relationships text not null,
  secrets text,
  source_type text not null default 'bible',
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists characters_project_idx
  on characters (project_id, name);

create table if not exists locations (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  description text not null,
  rules text,
  atmosphere text,
  source_type text not null default 'bible',
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists locations_project_idx
  on locations (project_id, name);

create table if not exists timeline_events (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  sequence_index integer not null,
  label text not null,
  description text not null,
  related_chapter_number integer,
  related_batch_number integer,
  source_type text not null default 'bible',
  source_id text,
  created_at timestamptz not null default now()
);

create index if not exists timeline_events_project_idx
  on timeline_events (project_id, sequence_index);

create table if not exists chapter_briefs (
  project_id text not null references projects(id) on delete cascade,
  chapter_number integer not null,
  title text not null,
  summary text not null,
  arc_purpose text not null,
  opening_hook text not null,
  closing_beat text not null,
  batch_start integer not null,
  batch_end integer not null,
  target_words integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, chapter_number)
);

create table if not exists revision_passes (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  chapter_number integer,
  batch_number integer,
  pass_type text not null,
  status text not null default 'pending',
  model text,
  findings jsonb,
  before_text text,
  after_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists revision_passes_project_idx
  on revision_passes (project_id, chapter_number, batch_number);

create table if not exists quality_reports (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  scope_type text not null,
  scope_id text,
  model text,
  scores jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quality_reports_project_idx
  on quality_reports (project_id, scope_type, scope_id);

create table if not exists retrieval_documents (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title text not null,
  content_hash text not null,
  vector_store_id text not null,
  openai_file_id text not null,
  vector_store_file_id text,
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz not null default now(),
  unique (project_id, source_type, source_id, content_hash, vector_store_id)
);

create index if not exists retrieval_documents_project_idx
  on retrieval_documents (project_id, source_type, source_id);

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
