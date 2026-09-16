-- Yunikov1 is isolated from the existing public schema.
-- The existing database contains an unrelated legacy schema with integer IDs.
-- This schema provides the UUID-based model defined by the Yunikov1 technical plan.
create schema if not exists yunikov_v1;

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

create type yunikov_v1.user_status as enum ('active','suspended','deleted');
create type yunikov_v1.follow_status as enum ('pending','accepted');
create type yunikov_v1.post_visibility as enum ('public','followers','private');
create type yunikov_v1.post_status as enum ('draft','processing','ready','failed');
create type yunikov_v1.conversation_type as enum ('dm','group');
create type yunikov_v1.event_type as enum ('auth.user.created','profile.created','auth.login.success','auth.login.failed','auth.login.new_device','follow.created','follow.accepted','follow.removed','post.created','like.created','like.removed','comment.created','save.created','share.created','story.created','story.viewed','message.created','message.read','search.performed','report.created','not_interested');

create table yunikov_v1.users (id uuid primary key default gen_random_uuid(), email varchar(320) not null, phone varchar(32), created_at timestamptz not null default now(), status yunikov_v1.user_status not null default 'active');
create unique index users_email_uq on yunikov_v1.users(email);
create table yunikov_v1.profiles (id uuid primary key references yunikov_v1.users(id) on delete cascade, username citext not null, display_name varchar(80) not null, bio varchar(500), avatar_url text, is_private boolean not null default false, country_code varchar(2), created_at timestamptz not null default now(), search_vector text, follower_count integer not null default 0, following_count integer not null default 0);
create unique index profiles_username_uq on yunikov_v1.profiles(username);
create index profiles_country_idx on yunikov_v1.profiles(country_code);
create table yunikov_v1.follows (follower_id uuid not null references yunikov_v1.users(id) on delete cascade, following_id uuid not null references yunikov_v1.users(id) on delete cascade, status yunikov_v1.follow_status not null default 'accepted', created_at timestamptz not null default now(), primary key (follower_id, following_id));
create index follows_following_idx on yunikov_v1.follows(following_id);
create table yunikov_v1.blocks (blocker_id uuid not null references yunikov_v1.users(id) on delete cascade, blocked_id uuid not null references yunikov_v1.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (blocker_id, blocked_id));
create table yunikov_v1.posts (id uuid primary key default gen_random_uuid(), author_id uuid not null references yunikov_v1.users(id) on delete cascade, caption text, visibility yunikov_v1.post_visibility not null default 'public', status yunikov_v1.post_status not null default 'ready', created_at timestamptz not null default now(), deleted_at timestamptz, like_count integer not null default 0, comment_count integer not null default 0, save_count integer not null default 0, share_count integer not null default 0, view_count integer not null default 0);
create index posts_author_created_idx on yunikov_v1.posts(author_id, created_at desc);
create table yunikov_v1.post_media (id uuid primary key default gen_random_uuid(), post_id uuid not null references yunikov_v1.posts(id) on delete cascade, url text not null, width integer, height integer, blurhash varchar(128), position integer not null default 0, status varchar(16) not null default 'ready');
create table yunikov_v1.likes (user_id uuid not null references yunikov_v1.users(id) on delete cascade, post_id uuid not null references yunikov_v1.posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create index likes_post_idx on yunikov_v1.likes(post_id);
create table yunikov_v1.comments (id uuid primary key default gen_random_uuid(), post_id uuid not null references yunikov_v1.posts(id) on delete cascade, author_id uuid not null references yunikov_v1.users(id) on delete cascade, parent_id uuid, body text not null, like_count integer not null default 0, reply_count integer not null default 0, created_at timestamptz not null default now(), deleted_at timestamptz);
create index comments_post_created_idx on yunikov_v1.comments(post_id, created_at);
create table yunikov_v1.saves (user_id uuid not null references yunikov_v1.users(id) on delete cascade, post_id uuid not null references yunikov_v1.posts(id) on delete cascade, created_at timestamptz not null default now(), primary key (user_id, post_id));
create table yunikov_v1.shares (id uuid primary key default gen_random_uuid(), post_id uuid not null references yunikov_v1.posts(id) on delete cascade, user_id uuid not null references yunikov_v1.users(id) on delete cascade, channel varchar(32) not null, created_at timestamptz not null default now());
create table yunikov_v1.stories (id uuid primary key default gen_random_uuid(), author_id uuid not null references yunikov_v1.users(id) on delete cascade, media_url text not null, created_at timestamptz not null default now(), expires_at timestamptz not null, visibility yunikov_v1.post_visibility not null default 'public');
create table yunikov_v1.story_views (story_id uuid not null references yunikov_v1.stories(id) on delete cascade, viewer_id uuid not null references yunikov_v1.users(id) on delete cascade, viewed_at timestamptz not null default now(), primary key (story_id, viewer_id));
create table yunikov_v1.conversations (id uuid primary key default gen_random_uuid(), type yunikov_v1.conversation_type not null default 'dm', created_at timestamptz not null default now(), last_message_at timestamptz);
create table yunikov_v1.conversation_members (conversation_id uuid not null references yunikov_v1.conversations(id) on delete cascade, user_id uuid not null references yunikov_v1.users(id) on delete cascade, role varchar(16) not null default 'member', joined_at timestamptz not null default now(), last_read_message_id uuid, is_archived boolean not null default false, is_request boolean not null default false, primary key (conversation_id, user_id));
create index conversation_members_user_idx on yunikov_v1.conversation_members(user_id);
create table yunikov_v1.messages (id uuid primary key, conversation_id uuid not null references yunikov_v1.conversations(id) on delete cascade, sender_id uuid not null references yunikov_v1.users(id) on delete cascade, body text, media_url text, reply_to_id uuid, created_at timestamptz not null default now(), deleted_at timestamptz);
create index messages_conversation_created_idx on yunikov_v1.messages(conversation_id, created_at desc);
create table yunikov_v1.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid not null references yunikov_v1.users(id) on delete cascade, actor_id uuid references yunikov_v1.users(id) on delete set null, type varchar(48) not null, entity_type varchar(32), entity_id uuid, group_key varchar(160), count integer not null default 1, is_read boolean not null default false, created_at timestamptz not null default now());
create index notifications_recipient_created_idx on yunikov_v1.notifications(recipient_id, created_at);
create table yunikov_v1.events (id uuid primary key default gen_random_uuid(), user_id uuid references yunikov_v1.users(id) on delete set null, post_id uuid references yunikov_v1.posts(id) on delete set null, type yunikov_v1.event_type not null, weight real not null default 1, country_code varchar(2), session_id uuid, dwell_ms integer, created_at timestamptz not null default now());
create index events_post_created_idx on yunikov_v1.events(post_id, created_at);
create index events_user_created_idx on yunikov_v1.events(user_id, created_at);
create table yunikov_v1.post_stats (post_id uuid primary key references yunikov_v1.posts(id) on delete cascade, impressions integer not null default 0, likes integer not null default 0, comments integer not null default 0, saves integer not null default 0, shares integer not null default 0, completion_rate real not null default 0, score double precision not null default 0, updated_at timestamptz not null default now());
create table yunikov_v1.post_distribution (post_id uuid primary key references yunikov_v1.posts(id) on delete cascade, stage integer not null default 1, countries jsonb not null default '[]'::jsonb, last_eval_at timestamptz, impressions_at_stage integer not null default 0, engagement_rate real not null default 0, velocity real not null default 0, status varchar(16) not null default 'active', second_chance_used boolean not null default false);
create table yunikov_v1.user_affinity (user_id uuid not null references yunikov_v1.users(id) on delete cascade, target_user_id uuid not null references yunikov_v1.users(id) on delete cascade, score real not null default 0, updated_at timestamptz not null default now(), primary key (user_id, target_user_id));
create table yunikov_v1.seen_posts (user_id uuid not null references yunikov_v1.users(id) on delete cascade, post_id uuid not null references yunikov_v1.posts(id) on delete cascade, seen_at timestamptz not null default now(), primary key (user_id, post_id));
create table yunikov_v1.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references yunikov_v1.users(id) on delete cascade, entity_type varchar(32) not null, entity_id uuid not null, reason varchar(64) not null, status varchar(16) not null default 'open', created_at timestamptz not null default now());
create table yunikov_v1.login_events (id uuid primary key default gen_random_uuid(), user_id uuid references yunikov_v1.users(id) on delete set null, ip text, user_agent text, country varchar(2), is_new_device boolean not null default false, created_at timestamptz not null default now());

grant usage on schema yunikov_v1 to service_role;
grant all privileges on all tables in schema yunikov_v1 to service_role;
grant all privileges on all sequences in schema yunikov_v1 to service_role;
