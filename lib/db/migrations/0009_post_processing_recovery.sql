-- Yunikov plan: durable processing must recover jobs abandoned by a worker.
-- A stale running job is returned to pending so another worker can retry it.

create or replace function yunikov_v1.requeue_stale_post_processing_jobs(p_stale_after interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path = pg_catalog, yunikov_v1
as $$
declare
  v_count integer;
begin
  update post_processing_jobs
     set status = 'pending',
         started_at = null,
         updated_at = now(),
         error_code = 'worker_timeout'
   where status = 'running'
     and started_at is not null
     and started_at < now() - p_stale_after
     and attempts < 5;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function yunikov_v1.requeue_stale_post_processing_jobs(interval) from public;

comment on function yunikov_v1.requeue_stale_post_processing_jobs(interval) is
  'Worker-only recovery boundary: requeues stale processing jobs up to five attempts.';
