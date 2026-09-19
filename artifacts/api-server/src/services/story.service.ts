import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { pool, setRlsUser } from "@workspace/db";
import { createDirectConversation, sendMessage } from "./messaging.service";

const MAX_STORY_BYTES = 100 * 1024 * 1024;
const TTL = 15 * 60;
function config() {
  const bucket = process.env.STORY_MEDIA_BUCKET ?? process.env.POST_MEDIA_BUCKET;
  const region = process.env.STORY_MEDIA_REGION ?? process.env.POST_MEDIA_REGION;
  const accessKeyId = process.env.STORY_MEDIA_ACCESS_KEY_ID ?? process.env.POST_MEDIA_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORY_MEDIA_SECRET_ACCESS_KEY ?? process.env.POST_MEDIA_SECRET_ACCESS_KEY;
  const endpoint = process.env.STORY_MEDIA_ENDPOINT ?? process.env.POST_MEDIA_ENDPOINT;
  const publicBaseUrl = (process.env.STORY_MEDIA_PUBLIC_BASE_URL ?? process.env.POST_MEDIA_PUBLIC_BASE_URL)?.replace(/\/$/, "");
  if (!bucket || !region || !accessKeyId || !secretAccessKey || !publicBaseUrl) throw new Error("story_storage_not_configured");
  return { bucket, region, accessKeyId, secretAccessKey, endpoint, publicBaseUrl };
}
function ext(name: string) { const m = name.toLowerCase().match(/\.([a-z0-9]{1,10})$/); return m ? "." + m[1] : ""; }
export async function requestStoryUploadUrl(userId: string, file: { name: string; contentType: string; size: number }) {
  if (file.size > MAX_STORY_BYTES) throw new Error("media_too_large");
  if (!/^(image\/(jpeg|png|webp|avif|gif)|video\/(mp4|webm|quicktime))$/.test(file.contentType)) throw new Error("unsupported_story_media");
  const c = config();
  const client = new S3Client({ region: c.region, endpoint: c.endpoint || undefined, forcePathStyle: process.env.STORY_MEDIA_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
  const key = "stories/" + userId + "/" + new Date().toISOString().slice(0, 10) + "/" + randomUUID() + ext(file.name);
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: file.contentType, ContentLength: file.size }), { expiresIn: TTL });
  return { uploadId: randomUUID(), uploadUrl, objectKey: key, publicUrl: c.publicBaseUrl + "/" + key.split("/").map(encodeURIComponent).join("/"), expiresAt: new Date(Date.now() + TTL * 1000).toISOString() };
}
export async function createStory(userId: string, input: { mediaUrl: string; caption?: string | null; visibility?: "public" | "followers" | "private"; mediaType?: string | null; width?: number | null; height?: number | null }) {
  const client = await pool.connect();
  try { await client.query("begin"); await setRlsUser(client, userId);
    const r = await client.query("select * from create_story($1,$2,$3,$4,$5,$6)", [input.mediaUrl, input.caption ?? null, input.visibility ?? "public", input.mediaType ?? null, input.width ?? null, input.height ?? null]);
    await client.query("commit"); return r.rows[0];
  } catch (e) { await client.query("rollback").catch(() => undefined); throw e; } finally { client.release(); }
}
export async function listStories(userId: string) {
  const client = await pool.connect();
  try { await client.query("begin"); await setRlsUser(client, userId);
    const r = await client.query("select s.id,s.author_id,p.username,p.display_name,p.avatar_url,s.media_url,s.caption,s.media_type,s.media_width,s.media_height,s.created_at,s.expires_at,s.visibility,exists(select 1 from story_views v where v.story_id=s.id and v.viewer_id=$1) viewed,coalesce(ua.score,0) affinity from stories s join profiles p on p.id=s.author_id left join user_affinity ua on ua.user_id=$1 and ua.target_user_id=s.author_id where s.expires_at>now() and s.archived_at is null and (s.author_id=$1 or s.visibility='public' or exists(select 1 from follows f where f.follower_id=$1 and f.following_id=s.author_id and f.status='accepted')) and not exists(select 1 from blocks b where (b.blocker_id=$1 and b.blocked_id=s.author_id) or (b.blocker_id=s.author_id and b.blocked_id=$1)) order by viewed asc, affinity desc, s.created_at desc", [userId]);
    await client.query("commit"); return r.rows;
  } catch (e) { await client.query("rollback").catch(() => undefined); throw e; } finally { client.release(); }
}
export async function viewStory(userId: string, storyId: string) {
  const client = await pool.connect(); try { await client.query("begin"); await setRlsUser(client,userId); const r=await client.query("select mark_story_view($1) inserted",[storyId]); await client.query("commit"); return Boolean(r.rows[0]?.inserted); } catch(e){ await client.query("rollback").catch(()=>undefined); throw e; } finally{client.release();}
}
export async function getStoryViews(userId: string, storyId: string) {
  const client=await pool.connect(); try{await client.query("begin");await setRlsUser(client,userId);const r=await client.query("select * from list_story_views($1)",[storyId]);await client.query("commit");return r.rows;}catch(e){await client.query("rollback").catch(()=>undefined);throw e;}finally{client.release();}
}
export async function deleteStory(userId: string, storyId: string) {
  const client=await pool.connect();try{await client.query("begin");await setRlsUser(client,userId);const r=await client.query("select delete_story($1) deleted",[storyId]);await client.query("commit");return Boolean(r.rows[0]?.deleted);}catch(e){await client.query("rollback").catch(()=>undefined);throw e;}finally{client.release();}
}
export async function replyToStory(userId: string, storyId: string, body: string) {
  const client=await pool.connect();
  let story:any;
  try{await client.query("begin");await setRlsUser(client,userId);const r=await client.query("select id,author_id,media_url,caption,expires_at from stories where id=$1 and expires_at>now() and archived_at is null",[storyId]);story=r.rows[0];if(!story)throw new Error("story_not_found");if(story.author_id===userId)throw new Error("cannot_reply_own_story");await client.query("commit");}catch(e){await client.query("rollback").catch(()=>undefined);throw e;}finally{client.release();}
  const conversationId=await createDirectConversation(userId,story.author_id);
  return sendMessage({userId,conversationId,body,kind:"story",metadata:{storyId:story.id,storyMediaUrl:story.media_url,storyCaption:story.caption,storyExpiresAt:story.expires_at}});
}