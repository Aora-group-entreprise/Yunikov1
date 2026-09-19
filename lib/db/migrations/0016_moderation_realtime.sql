-- Block 7: moderation / security hardening
-- Block 8: unified realtime invalidation transport
-- All payloads are identifiers/event types only. Clients refetch authoritative data.

create table if not exists yunikov_v1.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references yunikov_v1.reports(id) on delete set null,
  entity_type varchar(32) not null,
  entity_id uuid not null,
  action varchar(24) not null check (action in ('review','limit','hide','remove','restore','warn','suspend','unsuspend')),
  reason varchar(256),
  actor_id uuid references yunikov_v1.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists yunikov_v1.user_rate_limits (
  user_id uuid not null references yunikov_v1.users(id) on delete cascade,
  scope varchar(64) not null,
  window_started_at timestamptz not null default now(),
  used integer not null default 0,
  primary key (user_id, scope)
);

create index if not exists blocks_blocked_idx on yunikov_v1.blocks(blocked_id, blocker_id);
create index if not exists reports_entity_status_idx on yunikov_v1.reports(entity_type, entity_id, status, created_at desc);
create index if not exists reports_reporter_created_idx on yunikov_v1.reports(reporter_id, created_at desc);
create index if not exists moderation_actions_entity_created_idx on yunikov_v1.moderation_actions(entity_type, entity_id, created_at desc);
create index if not exists user_rate_limits_window_idx on yunikov_v1.user_rate_limits(window_started_at);

alter table yunikov_v1.moderation_actions enable row level security;
alter table yunikov_v1.user_rate_limits enable row level security;

drop policy if exists moderation_actions_no_client_access on yunikov_v1.moderation_actions;
create policy moderation_actions_no_client_access on yunikov_v1.moderation_actions
for all to authenticated using (false) with check (false);

drop policy if exists user_rate_limits_no_client_access on yunikov_v1.user_rate_limits;
create policy user_rate_limits_no_client_access on yunikov_v1.user_rate_limits
for all to authenticated using (false) with check (false);

-- Reports are private to their author. Moderation workers use service_role/server access.
alter table yunikov_v1.reports enable row level security;
drop policy if exists reports_owner_read on yunikov_v1.reports;
create policy reports_owner_read on yunikov_v1.reports
for select to authenticated
using (reporter_id = public.app_current_user_id());
drop policy if exists reports_owner_insert on yunikov_v1.reports;
create policy reports_owner_insert on yunikov_v1.reports
for insert to authenticated
with check (reporter_id = public.app_current_user_id());
drop policy if exists reports_no_client_update on yunikov_v1.reports;
create policy reports_no_client_update on yunikov_v1.reports
for update to authenticated using (false) with check (false);
drop policy if exists reports_no_client_delete on yunikov_v1.reports;
create policy reports_no_client_delete on yunikov_v1.reports
for delete to authenticated using (false);

-- Blocking is symmetric for reads: either side is hidden from the other.
alter table yunikov_v1.blocks enable row level security;
drop policy if exists blocks_self_read on yunikov_v1.blocks;
create policy blocks_self_read on yunikov_v1.blocks
for select to authenticated
using (blocker_id = public.app_current_user_id() or blocked_id = public.app_current_user_id());
drop policy if exists blocks_self_insert on yunikov_v1.blocks;
create policy blocks_self_insert on yunikov_v1.blocks
for insert to authenticated
with check (blocker_id = public.app_current_user_id() and blocked_id <> public.app_current_user_id());
drop policy if exists blocks_self_delete on yunikov_v1.blocks;
create policy blocks_self_delete on yunikov_v1.blocks
for delete to authenticated
using (blocker_id = public.app_current_user_id());

create or replace function yunikov_v1.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1
    from yunikov_v1.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Atomic user-scoped rate limiter. Returns true when the operation is allowed.
create or replace function yunikov_v1.check_rate_limit(
  p_scope varchar,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = yunikov_v1, pg_catalog
as $$
declare
  uid uuid := public.app_current_user_id();
  row_value yunikov_v1.user_rate_limits;
begin
  if uid is null or p_limit <= 0 or p_window_seconds <= 0 then
    return false;
  end if;

  insert into yunikov_v1.user_rate_limits(user_id, scope)
  values (uid, p_scope)
  on conflict (user_id, scope) do nothing;

  select * into row_value
  from yunikov_v1.user_rate_limits
  where user_id = uid and scope = p_scope
  for update;

  if row_value.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    update yunikov_v1.user_rate_limits
      set window_started_at = now(), used = 1
      where user_id = uid and scope = p_scope;
    return true;
  end if;

  if row_value.used >= p_limit then
    return false;
  end if;

  update yunikov_v1.user_rate_limits
    set used = used + 1
    where user_id = uid and scope = p_scope;
  return true;
end;
$$;

revoke all on function yunikov_v1.check_rate_limit(varchar, integer, integer) from public;
grant execute on function yunikov_v1.check_rate_limit(varchar, integer, integer) to authenticated;

-- Duplicate reports from the same reporter for the same entity/reason are ignored.
create unique index if not exists reports_reporter_entity_reason_uq
  on yunikov_v1.reports(reporter_id, entity_type, entity_id, reason);

-- Unified realtime channel. Payloads deliberately contain no private body/media content.
create or replace function yunikov_v1.notify_unified_realtime()
returns trigger
language plpgsql
security invoker
as $$
declare
  payload json;
  member_row record;
  target uuid;
begin
  if tg_table_name = 'messages' then
    for member_row in
      select user_id from yunikov_v1.conversation_members
      where conversation_id = coalesce(new.conversation_id, old.conversation_id)
    loop
      payload := json_build_object(
        'type', case when tg_op = 'DELETE' then 'message.deleted' else 'message.changed' end,
        'target_user_id', target,
        'conversation_id', coalesce(new.conversation_id, old.conversation_id),
        'message_id', coalesce(new.id, old.id)
      );
      perform pg_notify('yuniko_realtime_events', payload::text);
    end loop;
    return coalesce(new, old);
  end if;

  if tg_table_name = 'notifications' then
    payload := json_build_object(
      'type', 'notification.changed',
      'target_user_id', coalesce(new.recipient_id, old.recipient_id),
      'notification_id', coalesce(new.id, old.id)
    );
    perform pg_notify('yuniko_realtime_events', payload::text);
    return coalesce(new, old);
  end if;

  if tg_table_name = 'follows' then
    payload := json_build_object(
      'type', case when tg_op = 'DELETE' then 'follow.removed' else 'follow.changed' end,
      'target_user_id', coalesce(new.following_id, old.following_id),
      'actor_id', coalesce(new.follower_id, old.follower_id)
    );
    perform pg_notify('yuniko_realtime_events', payload::text);
    return coalesce(new, old);
  end if;

  if tg_table_name in ('likes','comments','saves','shares') then
    if tg_table_name = 'likes' then target := coalesce(new.post_id, old.post_id);
    elsif tg_table_name = 'comments' then target := coalesce(new.post_id, old.post_id);
    elsif tg_table_name = 'saves' then target := coalesce(new.post_id, old.post_id);
    else target := coalesce(new.post_id, old.post_id);
    end if;

    select p.author_id into target
    from yunikov_v1.posts p
    where p.id = target;

    payload := json_build_object(
      'type', tg_table_name || '.changed',
      'target_user_id', member_row.user_id,
      'post_id', target
    );
    perform pg_notify('yuniko_realtime_events', payload::text);
    perform pg_notify('yuniko_realtime_events', json_build_object('type','feed.invalidate','post_id',target)::text);
    return coalesce(new, old);
  end if;

  if tg_table_name in ('posts','stories') then
    payload := json_build_object(
      'type', case when tg_table_name = 'posts' then 'feed.invalidate' else 'story.changed' end,
      'target_user_id', coalesce(new.author_id, old.author_id),
      'entity_id', coalesce(new.id, old.id)
    );
    perform pg_notify('yuniko_realtime_events', payload::text);
    return coalesce(new, old);
  end if;

  if tg_table_name = 'story_views' then
    select s.author_id into target from yunikov_v1.stories s where s.id = coalesce(new.story_id, old.story_id);
    perform pg_notify('yuniko_realtime_events', json_build_object(
      'type','story.viewed','target_user_id',target,'story_id',coalesce(new.story_id,old.story_id)
    )::text);
    return coalesce(new, old);
  end if;

  if tg_table_name = 'blocks' then
    perform pg_notify('yuniko_realtime_events', json_build_object('type','feed.invalidate','target_user_id',coalesce(new.blocker_id,old.blocker_id))::text);
    perform pg_notify('yuniko_realtime_events', json_build_object('type','feed.invalidate','target_user_id',coalesce(new.blocked_id,old.blocked_id))::text);
    return coalesce(new, old);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_unified_realtime_messages on yunikov_v1.messages;
create trigger trg_unified_realtime_messages after insert or update or delete on yunikov_v1.messages
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_notifications on yunikov_v1.notifications;
create trigger trg_unified_realtime_notifications after insert or update or delete on yunikov_v1.notifications
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_follows on yunikov_v1.follows;
create trigger trg_unified_realtime_follows after insert or update or delete on yunikov_v1.follows
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_likes on yunikov_v1.likes;
create trigger trg_unified_realtime_likes after insert or delete on yunikov_v1.likes
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_comments on yunikov_v1.comments;
create trigger trg_unified_realtime_comments after insert or update or delete on yunikov_v1.comments
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_saves on yunikov_v1.saves;
create trigger trg_unified_realtime_saves after insert or delete on yunikov_v1.saves
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_shares on yunikov_v1.shares;
create trigger trg_unified_realtime_shares after insert on yunikov_v1.shares
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_posts on yunikov_v1.posts;
create trigger trg_unified_realtime_posts after insert or update or delete on yunikov_v1.posts
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_stories on yunikov_v1.stories;
create trigger trg_unified_realtime_stories after insert or update or delete on yunikov_v1.stories
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_story_views on yunikov_v1.story_views;
create trigger trg_unified_realtime_story_views after insert on yunikov_v1.story_views
for each row execute function yunikov_v1.notify_unified_realtime();

drop trigger if exists trg_unified_realtime_blocks on yunikov_v1.blocks;
create trigger trg_unified_realtime_blocks after insert or delete on yunikov_v1.blocks
for each row execute function yunikov_v1.notify_unified_realtime();

-- Keep the realtime function callable only by the database trigger mechanism.
revoke all on function yunikov_v1.notify_unified_realtime() from public;


-- Close direct-query privacy gaps created by old broad read policies.
drop policy if exists profiles_public_read on yunikov_v1.profiles;
create policy profiles_public_read on yunikov_v1.profiles
for select to authenticated
using (
  (not is_private or id = public.app_current_user_id() or exists (
    select 1 from yunikov_v1.follows f
    where f.follower_id = public.app_current_user_id()
      and f.following_id = profiles.id
      and f.status = 'accepted'
  ))
  and not yunikov_v1.is_blocked(public.app_current_user_id(), id)
);

drop policy if exists follows_read on yunikov_v1.follows;
create policy follows_read on yunikov_v1.follows
for select to authenticated
using (
  (follower_id = public.app_current_user_id() or following_id = public.app_current_user_id())
  and not yunikov_v1.is_blocked(public.app_current_user_id(), follower_id)
  and not yunikov_v1.is_blocked(public.app_current_user_id(), following_id)
);

drop policy if exists post_media_read on yunikov_v1.post_media;
create policy post_media_read on yunikov_v1.post_media
for select to authenticated
using (
  exists (
    select 1 from yunikov_v1.posts p
    where p.id = post_media.post_id
      and not yunikov_v1.is_blocked(public.app_current_user_id(), p.author_id)
      and (
        p.author_id = public.app_current_user_id()
        or p.visibility = 'public'
        or (p.visibility = 'followers' and exists (
          select 1 from yunikov_v1.follows f
          where f.follower_id = public.app_current_user_id()
            and f.following_id = p.author_id
            and f.status = 'accepted'
        ))
      )
      and p.deleted_at is null
  )
);

drop policy if exists comments_read on yunikov_v1.comments;
create policy comments_read on yunikov_v1.comments
for select to authenticated
using (
  exists (
    select 1 from yunikov_v1.posts p
    where p.id = comments.post_id
      and not yunikov_v1.is_blocked(public.app_current_user_id(), p.author_id)
      and not yunikov_v1.is_blocked(public.app_current_user_id(), comments.author_id)
  )
);

drop policy if exists stories_read on yunikov_v1.stories;
create policy stories_read on yunikov_v1.stories
for select to authenticated
using (
  expires_at > now()
  and not yunikov_v1.is_blocked(public.app_current_user_id(), author_id)
  and (
    author_id = public.app_current_user_id()
    or visibility = 'public'
    or exists (
      select 1 from yunikov_v1.follows f
      where f.follower_id = public.app_current_user_id()
        and f.following_id = stories.author_id
        and f.status = 'accepted'
    )
  )
);

drop policy if exists notifications_recipient on yunikov_v1.notifications;
create policy notifications_recipient on yunikov_v1.notifications
for select to authenticated
using (
  recipient_id = public.app_current_user_id()
  and (actor_id is null or not yunikov_v1.is_blocked(public.app_current_user_id(), actor_id))
);

-- The block relation is also a feed/recommendation boundary.
create index if not exists blocks_blocker_blocked_idx
  on yunikov_v1.blocks(blocker_id, blocked_id);
