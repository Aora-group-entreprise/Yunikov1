-- Block 7: realtime + messaging hardening.
-- Idempotent migration for conversations, requests, read cursors, media/voice messages,
-- group membership and PostgreSQL NOTIFY integration used by the realtime transport.

alter table yunikov_v1.messages
  add column if not exists kind varchar(16) not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table yunikov_v1.conversation_members
  add column if not exists muted_until timestamptz;

create table if not exists yunikov_v1.message_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references yunikov_v1.conversations(id) on delete cascade,
  initiator_id uuid not null references yunikov_v1.users(id) on delete cascade,
  kind varchar(8) not null check (kind in ('audio','video')),
  status varchar(16) not null default 'ringing' check (status in ('ringing','accepted','declined','missed','ended')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists message_calls_conversation_created_idx
  on yunikov_v1.message_calls(conversation_id, created_at desc);

create index if not exists conversation_members_user_active_idx
  on yunikov_v1.conversation_members(user_id, is_archived, is_request);

create index if not exists messages_sender_created_idx
  on yunikov_v1.messages(sender_id, created_at desc);

alter table yunikov_v1.message_calls enable row level security;

drop policy if exists message_calls_member_read on yunikov_v1.message_calls;
create policy message_calls_member_read on yunikov_v1.message_calls
for select to authenticated
using (exists (
  select 1 from yunikov_v1.conversation_members m
  where m.conversation_id = message_calls.conversation_id
    and m.user_id = yunikov_v1.app_current_user_id()
));

drop policy if exists message_calls_member_insert on yunikov_v1.message_calls;
create policy message_calls_member_insert on yunikov_v1.message_calls
for insert to authenticated
with check (
  initiator_id = yunikov_v1.app_current_user_id()
  and exists (
    select 1 from yunikov_v1.conversation_members m
    where m.conversation_id = message_calls.conversation_id
      and m.user_id = yunikov_v1.app_current_user_id()
  )
);

drop policy if exists message_calls_member_update on yunikov_v1.message_calls;
create policy message_calls_member_update on yunikov_v1.message_calls
for update to authenticated
using (exists (
  select 1 from yunikov_v1.conversation_members m
  where m.conversation_id = message_calls.conversation_id
    and m.user_id = yunikov_v1.app_current_user_id()
))
with check (exists (
  select 1 from yunikov_v1.conversation_members m
  where m.conversation_id = message_calls.conversation_id
    and m.user_id = yunikov_v1.app_current_user_id()
));

-- A conversation is readable only by its members. The original policy only exposed
-- the caller's own membership row, which is insufficient for group membership management.
drop policy if exists conversation_members_self on yunikov_v1.conversation_members;
drop policy if exists conversation_members_member_read on yunikov_v1.conversation_members;
create policy conversation_members_member_read on yunikov_v1.conversation_members
for select to authenticated
using (exists (
  select 1 from yunikov_v1.conversation_members me
  where me.conversation_id = conversation_members.conversation_id
    and me.user_id = yunikov_v1.app_current_user_id()
));

-- Members can archive/mute their own membership and update only their read/request state.
drop policy if exists conversation_members_self_update on yunikov_v1.conversation_members;
create policy conversation_members_self_update on yunikov_v1.conversation_members
for update to authenticated
using (user_id = yunikov_v1.app_current_user_id())
with check (user_id = yunikov_v1.app_current_user_id());

-- The server performs membership creation/removal after validating the caller.
-- No direct client INSERT/DELETE policy is added.

-- Ensure messages cannot be created by a non-member and cannot be reassigned on update.
drop policy if exists messages_sender_insert on yunikov_v1.messages;
create policy messages_sender_insert on yunikov_v1.messages
for insert to authenticated
with check (
  sender_id = yunikov_v1.app_current_user_id()
  and exists (
    select 1 from yunikov_v1.conversation_members m
    where m.conversation_id = messages.conversation_id
      and m.user_id = yunikov_v1.app_current_user_id()
  )
  and (body is not null or media_url is not null)
);

drop policy if exists messages_sender_update on yunikov_v1.messages;
create policy messages_sender_update on yunikov_v1.messages
for update to authenticated
using (sender_id = yunikov_v1.app_current_user_id())
with check (sender_id = yunikov_v1.app_current_user_id());

-- Realtime transport hook. Payloads contain only identifiers and event metadata,
-- never message bodies or private media URLs.
create or replace function yunikov_v1.notify_message_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  perform pg_notify(
    'yuniko_message_events',
    json_build_object(
      'conversation_id', coalesce(new.conversation_id, old.conversation_id),
      'message_id', coalesce(new.id, old.id),
      'type', case when tg_op = 'DELETE' then 'message.deleted' else 'message.changed' end
    )::text
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_message_realtime on yunikov_v1.messages;
create trigger trg_message_realtime
after insert or update or delete on yunikov_v1.messages
for each row execute function yunikov_v1.notify_message_change();

create or replace function yunikov_v1.sync_conversation_last_message()
returns trigger
language plpgsql
security invoker
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    update yunikov_v1.conversations
      set last_message_at = new.created_at
      where id = new.conversation_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_conversation_last_message on yunikov_v1.messages;
create trigger trg_conversation_last_message
after insert or update on yunikov_v1.messages
for each row execute function yunikov_v1.sync_conversation_last_message();

create or replace function yunikov_v1.enforce_message_request()
returns trigger
language plpgsql
security invoker
as $$
declare
  recipient uuid;
  sender_follows boolean;
begin
  if new.sender_id is null then return new; end if;

  select m.user_id into recipient
  from yunikov_v1.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
  order by m.joined_at
  limit 1;

  if recipient is null then return new; end if;

  select exists (
    select 1 from yunikov_v1.follows f
    where f.follower_id = new.sender_id
      and f.following_id = recipient
      and f.status = 'accepted'
  ) into sender_follows;

  if not sender_follows then
    update yunikov_v1.conversation_members
      set is_request = true
      where conversation_id = new.conversation_id
        and user_id = recipient;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_message_request on yunikov_v1.messages;
create trigger trg_message_request
after insert on yunikov_v1.messages
for each row execute function yunikov_v1.enforce_message_request();
