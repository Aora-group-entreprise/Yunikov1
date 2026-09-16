import { pool } from "@workspace/db";
import type { CreatePostInput, UpdatePostInput, PostResponse } from "@workspace/api-zod";
import { setRlsUser } from "@workspace/db";

function toPostResponse(row: any, media: any[]): PostResponse {
  return PostResponse.parse({
    id: row.id,
    authorId: row.author_id,
    caption: row.caption ?? null,
    visibility: row.visibility,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    saveCount: row.save_count,
    shareCount: row.share_count,
    viewCount: row.view_count,
    media: media.map((item) => ({
      id: item.id,
      url: item.url,
      width: item.width ?? null,
      height: item.height ?? null,
      blurhash: item.blurhash ?? null,
      position: item.position,
      status: item.status,
    })),
  });
}

export async function createPost(userId: string, input: CreatePostInput): Promise<PostResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);

    const post = await client.query(
      `insert into posts (author_id, caption, visibility, status)
       values ($1, $2, $3, 'processing')
       returning *`,
      [userId, input.caption ?? null, input.visibility],
    );

    const postRow = post.rows[0];
    for (const media of input.media) {
      await client.query(
        `insert into post_media (post_id, url, width, height, blurhash, position, status)
         values ($1, $2, $3, $4, $5, $6, 'ready')`,
        [postRow.id, media.url, media.width ?? null, media.height ?? null, media.blurhash ?? null, media.position],
      );
    }

    await client.query(`update posts set status = 'ready' where id = $1`, [postRow.id]);
    await client.query(
      `insert into post_stats (post_id) values ($1) on conflict (post_id) do nothing`,
      [postRow.id],
    );
    await client.query(
      `insert into post_distribution (post_id, countries, status)
       select $1, jsonb_build_array(coalesce(p.country_code, 'US')), 'active'
       from profiles p where p.id = $2
       on conflict (post_id) do nothing`,
      [postRow.id, userId],
    );
    await client.query(
      `insert into events (user_id, post_id, type, weight)
       values ($1, $2, 'post.created', 1)`,
      [userId, postRow.id],
    );

    const mediaRows = await client.query(
      `select id, url, width, height, blurhash, position, status
       from post_media where post_id = $1 order by position asc`,
      [postRow.id],
    );
    const fresh = await client.query(`select * from posts where id = $1`, [postRow.id]);
    await client.query("commit");
    return toPostResponse(fresh.rows[0], mediaRows.rows);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePost(userId: string, postId: string, input: UpdatePostInput): Promise<PostResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const current = await client.query(`select * from posts where id = $1 and author_id = $2 and deleted_at is null for update`, [postId, userId]);
    if (!current.rows[0]) throw new Error("post_not_found");

    const nextCaption = input.caption === undefined ? current.rows[0].caption : input.caption;
    const nextVisibility = input.visibility === undefined ? current.rows[0].visibility : input.visibility;
    await client.query(
      `insert into post_edits (post_id, editor_id, caption) values ($1, $2, $3)`,
      [postId, userId, nextCaption],
    );
    await client.query(`update posts set caption = $1, visibility = $2 where id = $3`, [nextCaption, nextVisibility, postId]);
    const media = await client.query(`select id, url, width, height, blurhash, position, status from post_media where post_id = $1 order by position asc`, [postId]);
    const fresh = await client.query(`select * from posts where id = $1`, [postId]);
    await client.query("commit");
    return toPostResponse(fresh.rows[0], media.rows);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePost(userId: string, postId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const result = await client.query(
      `update posts set deleted_at = now(), status = 'failed' where id = $1 and author_id = $2 and deleted_at is null returning id`,
      [postId, userId],
    );
    if (!result.rows[0]) throw new Error("post_not_found");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
