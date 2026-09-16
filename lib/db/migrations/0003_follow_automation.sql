-- Follow side effects that must not depend on client-controlled state.
-- RLS remains the access-control boundary for application queries; these derived
-- records are maintained transactionally by the database.

create or replace function sync_follow_side_effects() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      insert into user_affinity (user_id, target_user_id, score)
      values (new.follower_id, new.following_id, 0.5)
      on conflict (user_id, target_user_id)
      do update set score = greatest(user_affinity.score, 0.5), updated_at = now();

      insert into notifications (recipient_id, actor_id, type, entity_type, entity_id, group_key)
      values (new.following_id, new.follower_id, 'follow', 'user', new.follower_id, 'follow:' || new.follower_id::text);
    else
      insert into notifications (recipient_id, actor_id, type, entity_type, entity_id, group_key)
      values (new.following_id, new.follower_id, 'follow_request', 'user', new.follower_id, 'follow_request:' || new.follower_id::text);
    end if;
  elsif tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted' then
    insert into user_affinity (user_id, target_user_id, score)
    values (new.follower_id, new.following_id, 0.5)
    on conflict (user_id, target_user_id)
    do update set score = greatest(user_affinity.score, 0.5), updated_at = now();

    insert into notifications (recipient_id, actor_id, type, entity_type, entity_id, group_key)
    values (new.follower_id, new.following_id, 'follow_accepted', 'user', new.following_id, 'follow_accepted:' || new.following_id::text);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_follow_side_effects on follows;
create trigger trg_follow_side_effects
after insert or update on follows
for each row execute function sync_follow_side_effects();
