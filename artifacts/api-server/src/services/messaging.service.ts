import { randomUUID } from "node:crypto";
import { pool, setRlsUser } from "@workspace/db";

export type MessageKind = "text" | "image" | "video" | "voice" | "file" | "story";

async function member(client: import("pg").PoolClient, conversationId: string, userId: string) {
  const result = await client.query(
    `select conversation_id, user_id, role, is_archived, is_request, last_read_message_id, muted_until
     from conversation_members
     where conversation_id = $1 and user_id = $2`,
    [conversationId, userId],
  );
  return result.rows[0] ?? null;
}

async function assertNotBlocked(client: import("pg").PoolClient, a: string, b: string) {
  const result = await client.query(
    `select 1 from blocks
     where (blocker_id = $1 and blocked_id = $2)
        or (blocker_id = $2 and blocked_id = $1)
     limit 1`,
    [a, b],
  );
  if (result.rowCount) throw new Error("blocked_relationship");
}

export async function createDirectConversation(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new Error("cannot_message_self");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    await assertNotBlocked(client, userId, targetUserId);

    const existing = await client.query(
      `select c.id
       from conversations c
       join conversation_members a on a.conversation_id = c.id and a.user_id = $1
       join conversation_members b on b.conversation_id = c.id and b.user_id = $2
       where c.type = 'dm'
       limit 1`,
      [userId, targetUserId],
    );
    if (existing.rows[0]) {
      await client.query("commit");
      return existing.rows[0].id as string;
    }

    const conversationId = randomUUID();
    const follows = await client.query(
      `select exists (
        select 1 from follows
        where follower_id = $1 and following_id = $2 and status = 'accepted'
      ) as connected`,
      [userId, targetUserId],
    );
    const connected = Boolean(follows.rows[0]?.connected);

    await client.query("insert into conversations(id, type) values ($1, 'dm')", [conversationId]);
    await client.query(
      `insert into conversation_members(conversation_id, user_id, role, is_request)
       values ($1, $2, 'member', false), ($1, $3, 'member', $4)`,
      [conversationId, userId, targetUserId, !connected],
    );
    await client.query("commit");
    return conversationId;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createGroupConversation(userId: string, memberIds: string[]) {
  const uniqueMembers = [...new Set([userId, ...memberIds])];
  if (uniqueMembers.length < 3) throw new Error("group_requires_three_members");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    for (const id of uniqueMembers) {
      if (id !== userId) await assertNotBlocked(client, userId, id);
    }

    const conversationId = randomUUID();
    await client.query("insert into conversations(id, type) values ($1, 'group')", [conversationId]);
    for (const id of uniqueMembers) {
      await client.query(
        `insert into conversation_members(conversation_id, user_id, role, is_request)
         values ($1, $2, $3, false)`,
        [conversationId, id, id === userId ? "admin" : "member"],
      );
    }
    await client.query("commit");
    return conversationId;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listConversations(userId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      `select c.id, c.type, c.created_at, c.last_message_at,
              m.is_archived, m.is_request, m.last_read_message_id,
              coalesce(json_agg(json_build_object(
                'userId', p.id, 'username', p.username, 'displayName', p.display_name,
                'avatarUrl', p.avatar_url
              ) order by p.username) filter (where p.id is not null), '[]') as members
       from conversations c
       join conversation_members m on m.conversation_id = c.id and m.user_id = $1
       left join conversation_members all_m on all_m.conversation_id = c.id
       left join profiles p on p.id = all_m.user_id
       where not m.is_archived
       group by c.id, m.is_archived, m.is_request, m.last_read_message_id
       order by c.last_message_at desc nulls last, c.created_at desc`,
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

export async function listMessages(userId: string, conversationId: string, before?: string, limit = 50) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    if (!await member(client, conversationId, userId)) throw new Error("conversation_not_found");

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const result = await client.query(
      `select m.id, m.conversation_id, m.sender_id, m.body, m.media_url, m.reply_to_id,
              m.kind, m.metadata, m.created_at, m.deleted_at
       from messages m
       where m.conversation_id = $1
         and ($2::timestamptz is null or m.created_at < $2::timestamptz)
       order by m.created_at desc, m.id desc
       limit $3`,
      [conversationId, before ?? null, safeLimit],
    );
    await client.query("commit");
    return result.rows.reverse();
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function sendMessage(input: {
  userId: string;
  conversationId: string;
  messageId?: string;
  body?: string | null;
  mediaUrl?: string | null;
  replyToId?: string | null;
  kind?: MessageKind;
  metadata?: Record<string, unknown>;
}) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, input.userId);
    const me = await member(client, input.conversationId, input.userId);
    if (!me) throw new Error("conversation_not_found");
    if (me.is_request) throw new Error("request_must_be_accepted");

    const id = input.messageId ?? randomUUID();
    const result = await client.query(
      `insert into messages(
        id, conversation_id, sender_id, body, media_url, reply_to_id, kind, metadata
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (id) do update set id = excluded.id
       returning id, conversation_id, sender_id, body, media_url, reply_to_id, kind, metadata, created_at, deleted_at`,
      [
        id,
        input.conversationId,
        input.userId,
        input.body ?? null,
        input.mediaUrl ?? null,
        input.replyToId ?? null,
        input.kind ?? "text",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    await client.query(
      `insert into events(user_id, type, weight)
       values ($1, 'message.created', 1)`,
      [input.userId],
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

export async function markConversationRead(userId: string, conversationId: string, messageId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      `update conversation_members cm
       set last_read_message_id = $3, is_request = false
       where cm.conversation_id = $1 and cm.user_id = $2
         and exists (
           select 1 from messages m
           where m.id = $3 and m.conversation_id = cm.conversation_id
         )
       returning conversation_id, user_id, last_read_message_id`,
      [conversationId, userId, messageId],
    );
    if (!result.rows[0]) throw new Error("message_not_found");
    await client.query(
      `insert into events(user_id, type, weight) values ($1, 'message.read', 1)`,
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

export async function setConversationState(
  userId: string,
  conversationId: string,
  patch: { archived?: boolean; mutedUntil?: string | null },
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      `update conversation_members
       set is_archived = coalesce($3, is_archived),
           muted_until = case when $4::boolean then $5::timestamptz else muted_until end
       where conversation_id = $1 and user_id = $2
       returning conversation_id, user_id, is_archived, muted_until, is_request`,
      [
        conversationId,
        userId,
        patch.archived ?? null,
        patch.mutedUntil !== undefined,
        patch.mutedUntil ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("conversation_not_found");
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function manageGroupMember(
  userId: string,
  conversationId: string,
  targetUserId: string,
  action: "add" | "remove",
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const me = await member(client, conversationId, userId);
    if (!me || me.role !== "admin") throw new Error("group_admin_required");
    const conversation = await client.query("select type from conversations where id = $1", [conversationId]);
    if (conversation.rows[0]?.type !== "group") throw new Error("group_required");
    if (action === "add") {
      if (targetUserId === userId) throw new Error("already_member");
      await assertNotBlocked(client, userId, targetUserId);
      await client.query(
        `insert into conversation_members(conversation_id, user_id, role)
         values ($1, $2, 'member')
         on conflict (conversation_id, user_id) do nothing`,
        [conversationId, targetUserId],
      );
    } else {
      if (targetUserId === userId) throw new Error("admin_cannot_remove_self");
      await client.query(
        `delete from conversation_members
         where conversation_id = $1 and user_id = $2`,
        [conversationId, targetUserId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
