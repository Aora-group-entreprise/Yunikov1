create type post_processing_status as enum ('pending', 'running', 'succeeded', 'failed');

create table if not exists post_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  status post_processing_status not null default 'pending',
  attempts integer not null default 0,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists post_processing_jobs_active_post_idx
  on post_processing_jobs (post_id)
  where status in ('pending', 'running');

create index if not exists post_processing_jobs_status_idx
  on post_processing_jobs (status, created_at);

alter table post_processing_jobs enable row level security;

drop policy if exists post_processing_jobs_owner_read on post_processing_jobs;
create policy post_processing_jobs_owner_read on post_processing_jobs
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_processing_jobs.post_id
        and p.author_id = app_current_user_id()
    )
  );

create or replace function touch_post_processing_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_post_processing_job_updated_at on post_processing_jobs;
create trigger trg_post_processing_job_updated_at
before update on post_processing_jobs
for each row execute function touch_post_processing_job_updated_at();

comment on table post_processing_jobs is
  'Durable processing boundary for post media. A worker must complete the job before posts.status becomes ready.';
