import { pool } from "@workspace/db";
import type { FollowListItem, FollowResponse } from "@workspace/api-zod";
import { setRlsUser } from "@workspace/db";

function rowToFollow(row: { follower_id: string; following_id: string; status: "pending" | "accepted" }): FollowResponse {
  return { followerId: row.follower_id, followingId: row.following_id, status: row.status };
}

async function ensureTarget(client: import("pg").PoolClient, userId: string, targetId: string) {
  const target = await client.query("select id, is_private from profiles where id = $1", [targetId]);
  if (!target.rows[0]) throw new Error("user_not_found");
  if (userId === targetId) throw new Error("cannot_follow_self");

  const blocked = await client.query(
    `select 1 from blocks
     where (blocker_id = $1 and blocked_id = $2)
        or (blocker_id = $2 and blocked_id = $1)
     limit 1`,
    [userId, targetId],
  );
  if (blocked.rowCount) throw new Error("blocked_relationship");
  return Boolean(target.rows[0].is_private);
}

export async function toggleFollow(userId: string, targetId: string): Promise<FollowResponse | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const isPrivate = await ensureTarget(client, userId, targetId);
    const existing = await client.query(
      "select follower_id, following_id, status from follows where follower_id = $1 and following_id = $2 for update",
      [userId, targetId],
    );

    if (existing.rows[0]) {
      await client.query("delete from follows where follower_id = $1 and following_id = $2", [userId, targetId]);
      await client.query("insert into events (user_id, type, weight) values ($1, 'follow.removed', 1)", [userId]);
      await client.query("commit");
      return null;
    }

    const status = isPrivate ? "pending" : "accepted";
    const inserted = await client.query(
      `insert into follows (follower_id, following_id, status)
       values ($1, $2, $3)
       returning follower_id, following_id, status`,
      [userId, targetId, status],
    );
    await client.query("insert into events (user_id, type, weight) values ($1, 'follow.created', 1)", [userId]);
    await client.query("commit");
    return rowToFollow(inserted.rows[0]);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function acceptFollowRequest(userId: string, followerId: string): Promise<FollowResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      `update follows
       set status = 'accepted'
       where follower_id = $1 and following_id = $2 and status = 'pending'
       returning follower_id, following_id, status`,
      [followerId, userId],
    );
    if (!result.rows[0]) throw new Error("follow_request_not_found");
    await client.query("insert into events (user_id, type, weight) values ($1, 'follow.accepted', 1)", [userId]);
    await client.query("commit");
    return rowToFollow(result.rows[0]);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectFollowRequest(userId: string, followerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      "delete from follows where follower_id = $1 and following_id = $2 and status = 'pending' returning follower_id",
      [followerId, userId],
    );
    if (!result.rows[0]) throw new Error("follow_request_not_found");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function removeFollower(userId: string, followerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      "delete from follows where follower_id = $1 and following_id = $2 returning follower_id",
      [followerId, userId],
    );
    if (!result.rows[0]) throw new Error("follow_not_found");
    await client.query("insert into events (user_id, type, weight) values ($1, 'follow.removed', 1)", [userId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function listUsers(userId: string, direction: "followers" | "following"): Promise<FollowListItem[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const query = direction === "followers"
      ? `select p.id, p.username, p.display_name, p.avatar_url
         from follows f join profiles p on p.id = f.follower_id
         where f.following_id = $1 and f.status = 'accepted'
         order by f.created_at desc`
      : `select p.id, p.username, p.display_name, p.avatar_url
         from follows f join profiles p on p.id = f.following_id
         where f.follower_id = $1 and f.status = 'accepted'
         order by f.created_at desc`;
    const result = await client.query(query, [userId]);
    await client.query("commit");
    return result.rows.map((row) => ({ userId: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url ?? null }));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function listFollowers(userId: string) { return listUsers(userId, "followers"); }
export function listFollowing(userId: string) { return listUsers(userId, "following"); }
