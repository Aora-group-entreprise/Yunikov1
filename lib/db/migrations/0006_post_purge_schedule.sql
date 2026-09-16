-- Yunikov plan: deleted posts are soft-deleted first, then physically purged after 30 days.
-- pg_cron is enabled by the deployment environment; keep scheduling idempotent.
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'yuniko-purge-deleted-posts'
  ) then
    perform cron.schedule(
      'yuniko-purge-deleted-posts',
      '0 3 * * *',
      'select purge_deleted_posts_older_than_30_days();'
    );
  end if;
end;
$$;
