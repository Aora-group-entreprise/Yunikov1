-- Phase 1 profile completion: username history for safe username changes.
create table if not exists yunikov_v1.username_history (
  user_id uuid not null references yunikov_v1.users(id) on delete cascade,
  username citext not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, username)
);
create index if not exists username_history_username_idx on yunikov_v1.username_history(username);
alter table yunikov_v1.username_history enable row level security;
drop policy if exists username_history_self on yunikov_v1.username_history;
create policy username_history_self on yunikov_v1.username_history for select using (user_id = yunikov_v1.app_current_user_id());
revoke all on yunikov_v1.username_history from authenticated;
grant select on yunikov_v1.username_history to authenticated;
