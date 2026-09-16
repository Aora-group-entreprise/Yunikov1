create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- The API sets app.user_id for each authenticated transaction. RLS is the final authority.
create or replace function app_current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function create_profile_for_user() returns trigger
language plpgsql security invoker as $$
begin
  insert into profiles (id, username, display_name)
  values (new.id, 'user_' || substr(new.id::text, 1, 8), 'New user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_users_profile on users;
create trigger trg_users_profile after insert on users for each row execute function create_profile_for_user();

create or replace function sync_follow_counts() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' and new.status = 'accepted' then
    update profiles set following_count = following_count + 1 where id = new.follower_id;
    update profiles set follower_count = follower_count + 1 where id = new.following_id;
  elsif tg_op = 'DELETE' and old.status = 'accepted' then
    update profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update profiles set follower_count = greatest(0, follower_count - 1) where id = old.following_id;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'accepted' and new.status = 'accepted' then
      update profiles set following_count = following_count + 1 where id = new.follower_id;
      update profiles set follower_count = follower_count + 1 where id = new.following_id;
    elsif old.status = 'accepted' and new.status <> 'accepted' then
      update profiles set following_count = greatest(0, following_count - 1) where id = new.follower_id;
      update profiles set follower_count = greatest(0, follower_count - 1) where id = new.following_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_follow_counts on follows;
create trigger trg_follow_counts after insert or update or delete on follows for each row execute function sync_follow_counts();

create or replace function sync_post_like_count() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    update posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_post_like_count on likes;
create trigger trg_post_like_count after insert or delete on likes for each row execute function sync_post_like_count();

create or replace function sync_post_comment_count() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' and old.deleted_at is null then
    update posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_post_comment_count on comments;
create trigger trg_post_comment_count after insert or delete on comments for each row execute function sync_post_comment_count();

-- RLS: clients cannot bypass ownership/visibility rules by changing UI state.
alter table users enable row level security;
alter table profiles enable row level security;
alter table follows enable row level security;
alter table blocks enable row level security;
alter table posts enable row level security;
alter table post_media enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;
alter table saves enable row level security;
alter table shares enable row level security;
alter table stories enable row level security;
alter table story_views enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table events enable row level security;
alter table post_stats enable row level security;
alter table post_distribution enable row level security;
alter table user_affinity enable row level security;
alter table seen_posts enable row level security;
alter table reports enable row level security;
alter table login_events enable row level security;

create policy users_self on users for select using (id = app_current_user_id());
create policy profiles_public_read on profiles for select using (
  not is_private or id = app_current_user_id() or exists (select 1 from follows f where f.follower_id = app_current_user_id() and f.following_id = profiles.id and f.status = 'accepted')
);
create policy profiles_self_insert on profiles for insert with check (id = app_current_user_id());
create policy profiles_self_update on profiles for update using (id = app_current_user_id()) with check (id = app_current_user_id());

create policy follows_read on follows for select using (follower_id = app_current_user_id() or following_id = app_current_user_id());
create policy follows_insert on follows for insert with check (follower_id = app_current_user_id() and follower_id <> following_id);
create policy follows_update_target on follows for update using (following_id = app_current_user_id()) with check (following_id = app_current_user_id());
create policy follows_delete_self on follows for delete using (follower_id = app_current_user_id() or following_id = app_current_user_id());

create policy blocks_self on blocks for all using (blocker_id = app_current_user_id()) with check (blocker_id = app_current_user_id());

create policy posts_read on posts for select using (
  deleted_at is null and (
    author_id = app_current_user_id() or visibility = 'public' or
    (visibility = 'followers' and exists (select 1 from follows f where f.follower_id = app_current_user_id() and f.following_id = posts.author_id and f.status = 'accepted'))
  ) and not exists (select 1 from blocks b where b.blocker_id = app_current_user_id() and b.blocked_id = posts.author_id) and not exists (select 1 from blocks b where b.blocker_id = posts.author_id and b.blocked_id = app_current_user_id())
);
create policy posts_insert on posts for insert with check (author_id = app_current_user_id());
create policy posts_update on posts for update using (author_id = app_current_user_id()) with check (author_id = app_current_user_id());
create policy posts_delete on posts for delete using (author_id = app_current_user_id());

create policy post_media_read on post_media for select using (exists (select 1 from posts p where p.id = post_media.post_id));
create policy post_media_write on post_media for all using (exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = app_current_user_id())) with check (exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = app_current_user_id()));

create policy likes_self on likes for all using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
create policy comments_read on comments for select using (exists (select 1 from posts p where p.id = comments.post_id));
create policy comments_insert on comments for insert with check (author_id = app_current_user_id());
create policy comments_update on comments for update using (author_id = app_current_user_id()) with check (author_id = app_current_user_id());
create policy comments_delete on comments for delete using (author_id = app_current_user_id());
create policy saves_self on saves for all using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
create policy shares_self on shares for all using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

create policy stories_read on stories for select using (expires_at > now() and (author_id = app_current_user_id() or visibility = 'public' or exists (select 1 from follows f where f.follower_id = app_current_user_id() and f.following_id = stories.author_id and f.status = 'accepted')));
create policy stories_write on stories for all using (author_id = app_current_user_id()) with check (author_id = app_current_user_id());
create policy story_views_self on story_views for all using (viewer_id = app_current_user_id()) with check (viewer_id = app_current_user_id());

create policy conversation_members_self on conversation_members for select using (user_id = app_current_user_id());
create policy messages_member_read on messages for select using (exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = app_current_user_id()));
create policy messages_sender_insert on messages for insert with check (sender_id = app_current_user_id() and exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = app_current_user_id()));
create policy messages_sender_update on messages for update using (sender_id = app_current_user_id()) with check (sender_id = app_current_user_id());

create policy notifications_recipient on notifications for select using (recipient_id = app_current_user_id());
create policy notifications_update on notifications for update using (recipient_id = app_current_user_id()) with check (recipient_id = app_current_user_id());
create policy events_self_insert on events for insert with check (user_id = app_current_user_id());
create policy events_self_read on events for select using (user_id = app_current_user_id());
create policy seen_posts_self on seen_posts for all using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
create policy reports_self on reports for insert with check (reporter_id = app_current_user_id());
create policy reports_own_read on reports for select using (reporter_id = app_current_user_id());

-- Derived/algorithmic tables are not client-controlled. They are readable only for the owning user where applicable.
create policy post_stats_public_read on post_stats for select using (exists (select 1 from posts p where p.id = post_stats.post_id));
create policy distribution_public_read on post_distribution for select using (exists (select 1 from posts p where p.id = post_distribution.post_id));
create policy affinity_self_read on user_affinity for select using (user_id = app_current_user_id());
create policy post_stats_no_client_write on post_stats for all using (false) with check (false);
create policy distribution_no_client_write on post_distribution for all using (false) with check (false);
create policy login_events_self_read on login_events for select using (user_id = app_current_user_id());
