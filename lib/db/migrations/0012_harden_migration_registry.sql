-- The migration registry is infrastructure-only. It must not be exposed through the client API.
alter table yunikov_v1._yuniko_migrations enable row level security;
drop policy if exists migration_registry_service_only on yunikov_v1._yuniko_migrations;
create policy migration_registry_service_only on yunikov_v1._yuniko_migrations
  for all using (false) with check (false);
revoke all on yunikov_v1._yuniko_migrations from anon, authenticated;
