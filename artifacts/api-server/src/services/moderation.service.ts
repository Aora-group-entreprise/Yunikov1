import { pool, setRlsUser } from "@workspace/db";

export type ReportInput = {
  entityType: "post" | "user" | "comment" | "story";
  entityId: string;
  reason: string;
};

async function allowed(client: import("pg").PoolClient, userId: string, scope: string, limit: number, windowSeconds: number) {
  const result = await client.query(
    "select yunikov_v1.check_rate_limit($1, $2, $3) as allowed",
    [scope, limit, windowSeconds],
  );
  if (!result.rows[0]?.allowed) throw new Error("rate_limited");
}

export async function reportEntity(userId: string, input: ReportInput) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    await allowed(client, userId, "report", 10, 3600);

    const validReasons = new Set(["spam", "harassment", "hate", "sexual", "violence", "scam", "copyright", "other"]);
    if (!validReasons.has(input.reason)) throw new Error("invalid_report_reason");

    const entityTable: Record<ReportInput["entityType"], string> = {
      post: "posts",
      user: "users",
      comment: "comments",
      story: "stories",
    };
    const table = entityTable[input.entityType];
    const exists = await client.query(`select 1 from yunikov_v1.${table} where id = $1 limit 1`, [input.entityId]);
    if (!exists.rows[0]) throw new Error("entity_not_found");

    const result = await client.query(
      `insert into yunikov_v1.reports(reporter_id, entity_type, entity_id, reason)
       values ($1, $2, $3, $4)
       on conflict (reporter_id, entity_type, entity_id, reason)
       do update set status = 'pending'
       returning id, entity_type, entity_id, reason, status, created_at`,
      [userId, input.entityType, input.entityId, input.reason],
    );

    await client.query(
      `insert into yunikov_v1.events(user_id, type, weight)
       values ($1, 'report.created', 1)`,
      [userId],
    );
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function blockUser(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new Error("cannot_block_self");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    await allowed(client, userId, "block", 30, 3600);
    const target = await client.query("select 1 from yunikov_v1.users where id = $1 and status <> 'deleted'", [targetUserId]);
    if (!target.rows[0]) throw new Error("user_not_found");

    await client.query(
      `insert into yunikov_v1.blocks(blocker_id, blocked_id)
       values ($1, $2) on conflict do nothing`,
      [userId, targetUserId],
    );
    await client.query(
      `delete from yunikov_v1.follows
       where (follower_id = $1 and following_id = $2)
          or (follower_id = $2 and following_id = $1)`,
      [userId, targetUserId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function unblockUser(userId: string, targetUserId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    await client.query(
      "delete from yunikov_v1.blocks where blocker_id = $1 and blocked_id = $2",
      [userId, targetUserId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listBlockedUsers(userId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      `select b.blocked_id, b.created_at, p.username, p.display_name, p.avatar_url
       from yunikov_v1.blocks b
       join yunikov_v1.profiles p on p.id = b.blocked_id
       where b.blocker_id = $1
       order by b.created_at desc`,
      [userId],
    );
    await client.query("commit");
    return result.rows;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
