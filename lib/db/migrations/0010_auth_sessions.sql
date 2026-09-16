-- Phase 1: first-party Yunikov1 sessions. No email-confirmation gate.
alter table yunikov_v1.users add column if not exists password_hash text;

create table if not exists yunikov_v1.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references yunikov_v1.users(id) on delete cascade,
  refresh_token_hash text not null unique,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists auth_sessions_user_idx on yunikov_v1.auth_sessions(user_id, created_at desc);
create index if not exists auth_sessions_active_idx on yunikov_v1.auth_sessions(user_id, expires_at) where revoked_at is null;

alter table yunikov_v1.auth_sessions enable row level security;
drop policy if exists auth_sessions_self on yunikov_v1.auth_sessions;
create policy auth_sessions_self on yunikov_v1.auth_sessions
  for select using (yunikov_v1.app_current_user_id() = user_id);

grant select on yunikov_v1.auth_sessions to authenticated;
revoke insert, update, delete on yunikov_v1.auth_sessions from authenticated;
