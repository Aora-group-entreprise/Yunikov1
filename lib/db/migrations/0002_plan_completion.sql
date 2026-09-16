-- Yunikov1 base schema already defines post_status and the core UUID tables.
-- This migration only adds the phase-1 completion objects that are not in 0000.
alter table saves add column if not exists collection_id uuid;

create table if not exists post_edits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  editor_id uuid not null references users(id) on delete cascade,
  caption text,
  edited_at timestamptz not null default now()
);

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name varchar(80) not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table saves drop constraint if exists saves_collection_id_fkey;
alter table saves add constraint saves_collection_id_fkey foreign key (collection_id) references collections(id) on delete set null;

create table if not exists hashtags (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null unique,
  created_at timestamptz not null default now()
);

create table if not exists post_hashtags (
  post_id uuid not null references posts(id) on delete cascade,
  hashtag_id uuid not null references hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);

create table if not exists user_topic_affinity (
  user_id uuid not null references users(id) on delete cascade,
  topic_id uuid not null references hashtags(id) on delete cascade,
  score real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists notification_settings (
  user_id uuid primary key references users(id) on delete cascade,
  likes boolean not null default true,
  comments boolean not null default true,
  follows boolean not null default true,
  messages boolean not null default true,
  stories boolean not null default true,
  email_digest boolean not null default true,
  push_enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

create index if not exists post_edits_post_edited_idx on post_edits(post_id, edited_at desc);
create index if not exists post_hashtags_hashtag_idx on post_hashtags(hashtag_id, post_id);
create index if not exists user_topic_affinity_user_idx on user_topic_affinity(user_id, score desc);

alter table post_edits enable row level security;
alter table collections enable row level security;
alter table hashtags enable row level security;
alter table post_hashtags enable row level security;
alter table user_topic_affinity enable row level security;
alter table notification_settings enable row level security;

drop policy if exists post_edits_owner on post_edits;
create policy post_edits_owner on post_edits for all using (editor_id = app_current_user_id()) with check (editor_id = app_current_user_id());
drop policy if exists collections_owner on collections;
create policy collections_owner on collections for all using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
drop policy if exists hashtags_read on hashtags;
create policy hashtags_read on hashtags for select using (true);
drop policy if exists post_hashtags_read on post_hashtags;
create policy post_hashtags_read on post_hashtags for select using (exists (select 1 from posts p where p.id = post_hashtags.post_id));
drop policy if exists post_hashtags_author_write on post_hashtags;
create policy post_hashtags_author_write on post_hashtags for all using (exists (select 1 from posts p where p.id = post_hashtags.post_id and p.author_id = app_current_user_id())) with check (exists (select 1 from posts p where p.id = post_hashtags.post_id and p.author_id = app_current_user_id()));
drop policy if exists user_topic_affinity_self on user_topic_affinity;
create policy user_topic_affinity_self on user_topic_affinity for select using (user_id = app_current_user_id());
drop policy if exists user_topic_affinity_no_client_write on user_topic_affinity;
create policy user_topic_affinity_no_client_write on user_topic_affinity for all using (false) with check (false);
drop policy if exists notification_settings_self on notification_settings;
create policy notification_settings_self on notification_settings for all using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());
