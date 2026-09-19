-- Block 8: complete stories.
alter table yunikov_v1.stories
  add column if not exists caption text,
  add column if not exists archived_at timestamptz,
  add column if not exists media_type varchar(32),
  add column if not exists media_width integer,
  add column if not exists media_height integer;

create index if not exists stories_author_created_idx
  on yunikov_v1.stories(author_id, created_at desc);

create index if not exists stories_active_expires_idx
  on yunikov_v1.stories(expires_at)
  where archived_at is null;

create index if not exists story_views_story_viewed_idx
  on yunikov_v1.story_views(story_id, viewed_at desc);

-- Expired stories remain in the author's private archive instead of disappearing from
-- the database immediately. A later retention job may physically purge old media.
create or replace function yunikov_v1.archive_expired_stories()
returns integer
language plpgsql
security invoker
as $$
declare affected integer;
begin
  update yunikov_v1.stories
  set archived_at = coalesce(archived_at, now())
  where expires_at <= now()
    and archived_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- A story can be viewed once per viewer. The first view is the only persisted view.
drop policy if exists story_views_self on yunikov_v1.story_views;
create policy story_views_self on yunikov_v1.story_views
for all to authenticated
using (viewer_id = yunikov_v1.app_current_user_id())
with check (viewer_id = yunikov_v1.app_current_user_id());

-- Author can inspect views for their own active/archived stories.
drop policy if exists story_views_author_read on yunikov_v1.story_views;
create policy story_views_author_read on yunikov_v1.story_views
for select to authenticated
using (exists (
  select 1 from yunikov_v1.stories s
  where s.id = story_views.story_id
    and s.author_id = yunikov_v1.app_current_user_id()
));

-- Replies are regular messages carrying story identity in metadata. This keeps the
-- messaging source of truth in messages while preserving a frozen story reference.
create or replace function yunikov_v1.mark_story_view(p_story_id uuid)
returns boolean
language plpgsql
security invoker
as $$
declare inserted boolean;
begin
  insert into yunikov_v1.story_views(story_id, viewer_id)
  select s.id, yunikov_v1.app_current_user_id()
  from yunikov_v1.stories s
  where s.id = p_story_id
    and s.expires_at > now()
    and s.archived_at is null
    and (
      s.author_id = yunikov_v1.app_current_user_id()
      or s.visibility = 'public'
      or exists (
        select 1 from yunikov_v1.follows f
        where f.follower_id = yunikov_v1.app_current_user_id()
          and f.following_id = s.author_id
          and f.status = 'accepted'
      )
    )
  on conflict (story_id, viewer_id) do nothing;
  inserted := found;
  return inserted;
end;
$$;

create or replace function yunikov_v1.list_story_views(p_story_id uuid)
returns table(viewer_id uuid, viewed_at timestamptz)
language sql
security invoker
as $$
  select v.viewer_id, v.viewed_at
  from yunikov_v1.story_views v
  join yunikov_v1.stories s on s.id = v.story_id
  where v.story_id = p_story_id
    and s.author_id = yunikov_v1.app_current_user_id()
  order by v.viewed_at asc;
$$;

create or replace function yunikov_v1.create_story(
  p_media_url text,
  p_caption text default null,
  p_visibility yunikov_v1.post_visibility default 'public',
  p_media_type varchar default null,
  p_media_width integer default null,
  p_media_height integer default null
)
returns yunikov_v1.stories
language plpgsql
security invoker
as $$
declare result yunikov_v1.stories;
begin
  if p_media_url is null or length(trim(p_media_url)) = 0 then
    raise exception 'story_media_required';
  end if;

  insert into yunikov_v1.stories(
    author_id, media_url, caption, created_at, expires_at, visibility,
    media_type, media_width, media_height
  )
  values (
    yunikov_v1.app_current_user_id(), p_media_url, nullif(trim(p_caption), ''),
    now(), now() + interval '24 hours', p_visibility,
    p_media_type, p_media_width, p_media_height
  )
  returning * into result;

  insert into yunikov_v1.events(user_id, type, weight)
  values (yunikov_v1.app_current_user_id(), 'story.created', 1);

  return result;
end;
$$;

create or replace function yunikov_v1.delete_story(p_story_id uuid)
returns boolean
language plpgsql
security invoker
as $$
begin
  delete from yunikov_v1.stories
  where id = p_story_id
    and author_id = yunikov_v1.app_current_user_id();
  return found;
end;
$$;

-- Realtime hook for story creation/deletion and views. Only IDs are broadcast.
create or replace function yunikov_v1.notify_story_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  perform pg_notify(
    'yuniko_story_events',
    json_build_object(
      'story_id', coalesce(new.id, old.id),
      'author_id', coalesce(new.author_id, old.author_id),
      'type', case when tg_op = 'DELETE' then 'story.deleted' else 'story.changed' end
    )::text
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_story_realtime on yunikov_v1.stories;
create trigger trg_story_realtime
after insert or update or delete on yunikov_v1.stories
for each row execute function yunikov_v1.notify_story_change();

drop trigger if exists trg_story_view_realtime on yunikov_v1.story_views;
create trigger trg_story_view_realtime
after insert on yunikov_v1.story_views
for each row execute function yunikov_v1.notify_story_change();

-- Event for story views, without leaking viewer identity through the realtime payload.
create or replace function yunikov_v1.record_story_view_event()
returns trigger
language plpgsql
security invoker
as $$
begin
  insert into yunikov_v1.events(user_id, type, weight)
  values (new.viewer_id, 'story.viewed', 1);
  return new;
end;
$$;

drop trigger if exists trg_story_view_event on yunikov_v1.story_views;
create trigger trg_story_view_event
after insert on yunikov_v1.story_views
for each row execute function yunikov_v1.record_story_view_event();
