create table if not exists yunikov_v1.auth_rate_limits (
  ip text primary key,
  failures integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table yunikov_v1.auth_rate_limits enable row level security;
drop policy if exists auth_rate_limits_none on yunikov_v1.auth_rate_limits;
create policy auth_rate_limits_none on yunikov_v1.auth_rate_limits for all using (false) with check (false);
revoke all on yunikov_v1.auth_rate_limits from anon, authenticated;
