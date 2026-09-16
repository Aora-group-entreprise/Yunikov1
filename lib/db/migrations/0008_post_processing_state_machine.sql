-- Yunikov plan: processing is a server-side state machine.
-- The client can create a job, but it cannot mark media/posts ready.

create or replace function claim_post_processing_job(p_job_id uuid)
returns table (id uuid, post_id uuid, status post_processing_status, attempts integer)
language plpgsql
security definer
set search_path = pg_catalog, yunikov_v1
as $$
begin
  return query
  update post_processing_jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         started_at = coalesce(j.started_at, now()),
         updated_at = now()
   where j.id = p_job_id
     and j.status = 'pending'
  returning j.id, j.post_id, j.status, j.attempts;
end;
$$;

create or replace function complete_post_processing_job(p_job_id uuid, p_success boolean, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, yunikov_v1
as $$
declare
  v_post_id uuid;
begin
  select post_id into v_post_id
    from post_processing_jobs
   where id = p_job_id
     and status = 'running'
   for update;

  if v_post_id is null then
    raise exception 'post_processing_job_not_running';
  end if;

  if p_success then
    if exists (
      select 1 from post_media
       where post_id = v_post_id
         and status <> 'ready'
    ) then
      raise exception 'post_media_not_ready';
    end if;

    update post_processing_jobs
       set status = 'succeeded', error_code = null, finished_at = now(), updated_at = now()
     where id = p_job_id;

    update posts
       set status = 'ready'
     where id = v_post_id
       and deleted_at is null;
  else
    update post_processing_jobs
       set status = 'failed', error_code = p_error_code, finished_at = now(), updated_at = now()
     where id = p_job_id;

    update posts
       set status = 'failed'
     where id = v_post_id
       and deleted_at is null;

    update post_media
       set status = 'failed'
     where post_id = v_post_id
       and status <> 'ready';
  end if;
end;
$$;

revoke all on function claim_post_processing_job(uuid) from public;
revoke all on function complete_post_processing_job(uuid, boolean, text) from public;

comment on function claim_post_processing_job(uuid) is
  'Worker-only boundary: claims a pending Yunikov1 post-processing job.';
comment on function complete_post_processing_job(uuid, boolean, text) is
  'Worker-only boundary: only successful processing of every media item can make a post ready.';
