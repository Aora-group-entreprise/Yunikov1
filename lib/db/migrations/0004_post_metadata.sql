create table if not exists post_mentions (
  post_id uuid not null references posts(id) on delete cascade,
  mentioned_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, mentioned_user_id)
);

create index if not exists post_mentions_user_idx
  on post_mentions (mentioned_user_id, post_id);

alter table post_mentions enable row level security;

drop policy if exists post_mentions_read on post_mentions;
create policy post_mentions_read on post_mentions
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_mentions.post_id
        and p.deleted_at is null
    )
  );

drop policy if exists post_mentions_insert on post_mentions;
create policy post_mentions_insert on post_mentions
  for insert
  with check (
    exists (
      select 1 from posts p
      where p.id = post_mentions.post_id
        and p.author_id = app_current_user_id()
        and p.deleted_at is null
    )
  );

create or replace function purge_deleted_posts_older_than_30_days()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  removed integer;
begin
  delete from posts
  where deleted_at is not null
    and deleted_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
