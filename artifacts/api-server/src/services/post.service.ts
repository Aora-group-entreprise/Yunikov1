import { pool } from "@workspace/db";
import type { CreatePostInput, UpdatePostInput } from "@workspace/api-zod";
import { PostResponse } from "@workspace/api-zod";
import { setRlsUser } from "@workspace/db";
import { enqueuePostProcessingJob } from "./post-processing.service";

function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,100})/gu)].map((m) => m[2].toLowerCase()))];
}

function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(/(^|\s)@([a-zA-Z0-9_]{3,32})\b/g)].map((m) => m[2].toLowerCase()))];
}

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

async function initializePostMetadata(client: import("pg").PoolClient, postId: string, caption: string | null | undefined) {
  for (const name of extractHashtags(caption)) {
    const hashtag = await client.query(
      `insert into hashtags (name) values ($1)
       on conflict (name) do update set name = excluded.name
       returning id`,
      [name],
    );
    await client.query(
      `insert into post_hashtags (post_id, hashtag_id) values ($1, $2) on conflict do nothing`,
      [postId, hashtag.rows[0].id],
    );
  }

  for (const username of extractMentions(caption)) {
    const mentioned = await client.query(
      `select id from profiles where lower(username) = lower($1) limit 1`,
      [username],
    );
    if (mentioned.rows[0]) {
      await client.query(
        `insert into post_mentions (post_id, mentioned_user_id) values ($1, $2) on conflict do nothing`,
        [postId, mentioned.rows[0].id],
      );
    }
  }
}

async function initializeDistribution(client: import("pg").PoolClient, postId: string, authorId: string) {
  const author = await client.query(`select country_code from profiles where id = $1`, [authorId]);
  const creatorCountry = author.rows[0]?.country_code ?? "US";
  const followerCountries = await client.query(
    `select p.country_code as country, count(*)::int as followers
     from follows f join profiles p on p.id = f.follower_id
     where f.following_id = $1 and f.status = 'accepted' and p.country_code is not null
     group by p.country_code order by followers desc, p.country_code asc limit 2`,
    [authorId],
  );
  const countries = [creatorCountry, ...followerCountries.rows.map((row) => row.country)]
    .filter((country, index, list) => list.indexOf(country) === index).slice(0, 3);
  await client.query(
    `insert into post_distribution (post_id, stage, countries, status)
     values ($1, 1, $2::jsonb, 'active') on conflict (post_id) do nothing`,
    [postId, JSON.stringify(countries)],
  );
}

export async function createPost(userId: string, input: CreatePostInput): Promise<PostResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);
    const post = await client.query(
      `insert into posts (author_id, caption, visibility, status) values ($1, $2, $3, 'processing') returning *`,
      [userId, input.caption ?? null, input.visibility],
    );
    const postRow = post.rows[0];
    for (const media of input.media) {
      await client.query(
        `insert into post_media (post_id, url, object_key, content_type, file_size, width, height, blurhash, position, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing')`,
        [postRow.id, media.url, media.objectKey, media.contentType, media.fileSize, media.width ?? null, media.height ?? null, media.blurhash ?? null, media.position],
      );
    }
    await initializePostMetadata(client, postRow.id, input.caption);
    await enqueuePostProcessingJob(client, postRow.id);
    await client.query(`insert into post_stats (post_id) values ($1) on conflict (post_id) do nothing`, [postRow.id]);
    await initializeDistribution(client, postRow.id, userId);
    await client.query(`insert into events (user_id, post_id, type, weight) values ($1, $2, 'post.created', 1)`, [userId, postRow.id]);
    const mediaRows = await client.query(`select id, url, width, height, blurhash, position, status from post_media where post_id = $1 order by position asc`, [postRow.id]);
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
    await client.query(`insert into post_edits (post_id, editor_id, caption) values ($1, $2, $3)`, [postId, userId, nextCaption]);
    await client.query(`delete from post_hashtags where post_id = $1`, [postId]);
    await client.query(`delete from post_mentions where post_id = $1`, [postId]);
    await initializePostMetadata(client, postId, nextCaption);
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
    const result = await client.query(`update posts set deleted_at = now() where id = $1 and author_id = $2 and deleted_at is null returning id`, [postId, userId]);
    if (!result.rows[0]) throw new Error("post_not_found");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
