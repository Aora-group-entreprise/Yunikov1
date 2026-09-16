-- Media must follow the same visibility and block rules as its parent post.
-- A direct post_media query must never bypass the post-level privacy boundary.
drop policy if exists post_media_read on post_media;
create policy post_media_read on post_media
  for select
  using (
    exists (
      select 1
      from posts p
      where p.id = post_media.post_id
        and p.deleted_at is null
        and (
          p.author_id = app_current_user_id()
          or (
            p.status = 'ready'
            and (
              p.visibility = 'public'
              or (
                p.visibility = 'followers'
                and exists (
                  select 1
                  from follows f
                  where f.follower_id = app_current_user_id()
                    and f.following_id = p.author_id
                    and f.status = 'accepted'
                )
              )
            )
          )
        )
        and not exists (
          select 1 from blocks b
          where b.blocker_id = app_current_user_id()
            and b.blocked_id = p.author_id
        )
        and not exists (
          select 1 from blocks b
          where b.blocker_id = p.author_id
            and b.blocked_id = app_current_user_id()
        )
    )
  );

-- Authors may manage media belonging to their own posts only.
drop policy if exists post_media_write on post_media;
create policy post_media_write on post_media
  for all
  using (
    exists (
      select 1 from posts p
      where p.id = post_media.post_id
        and p.author_id = app_current_user_id()
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from posts p
      where p.id = post_media.post_id
        and p.author_id = app_current_user_id()
        and p.deleted_at is null
    )
  );
