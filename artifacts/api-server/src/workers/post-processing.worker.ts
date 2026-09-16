import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pool } from "@workspace/db";

type ProcessingMedia = {
  id: string;
  postId: string;
  objectKey: string;
  contentType: string | null;
};

type ModerationResult = { allowed: boolean; code?: string };

export interface PostMediaProcessor {
  process(media: ProcessingMedia): Promise<void>;
}

export interface PostModerationProvider {
  moderate(input: { postId: string; caption: string | null; media: ProcessingMedia[] }): Promise<ModerationResult>;
}

function storageConfig() {
  const bucket = process.env.POST_MEDIA_BUCKET;
  const region = process.env.POST_MEDIA_REGION;
  const accessKeyId = process.env.POST_MEDIA_ACCESS_KEY_ID;
  const secretAccessKey = process.env.POST_MEDIA_SECRET_ACCESS_KEY;
  const endpoint = process.env.POST_MEDIA_ENDPOINT;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) throw new Error("post_storage_not_configured");
  return { bucket, region, accessKeyId, secretAccessKey, endpoint };
}

function createStorageClient() {
  const config = storageConfig();
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: process.env.POST_MEDIA_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

/** Verifies that the uploaded object exists and is readable by the server. */
export class UploadedObjectProcessor implements PostMediaProcessor {
  async process(media: ProcessingMedia): Promise<void> {
    const config = storageConfig();
    const result = await createStorageClient().send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: media.objectKey }),
    );
    if (!result.ContentLength || result.ContentLength <= 0) throw new Error("media_empty");
    if (media.contentType && result.ContentType && result.ContentType !== media.contentType) {
      throw new Error("media_content_type_mismatch");
    }
  }
}

/**
 * Provider boundary required by the plan. No classifier is faked here.
 * Configure a real provider before production processing is enabled.
 */
export class RequiredModerationProvider implements PostModerationProvider {
  async moderate(): Promise<ModerationResult> {
    throw new Error("moderation_provider_not_configured");
  }
}

async function claimJob(jobId: string) {
  const result = await pool.query(
    "select * from yunikov_v1.claim_post_processing_job($1)",
    [jobId],
  );
  return result.rows[0] as { id: string; post_id: string; status: string; attempts: number } | undefined;
}

async function completeJob(jobId: string, success: boolean, errorCode?: string) {
  await pool.query(
    "select yunikov_v1.complete_post_processing_job($1, $2, $3)",
    [jobId, success, errorCode ?? null],
  );
}

async function loadJobMedia(postId: string): Promise<ProcessingMedia[]> {
  const result = await pool.query(
    `select id, post_id as "postId", object_key as "objectKey", content_type as "contentType"
       from yunikov_v1.post_media
      where post_id = $1
      order by position asc`,
    [postId],
  );
  return result.rows;
}

async function loadCaption(postId: string): Promise<string | null> {
  const result = await pool.query("select caption from yunikov_v1.posts where id = $1", [postId]);
  return result.rows[0]?.caption ?? null;
}

export async function processPostJob(
  jobId: string,
  mediaProcessor: PostMediaProcessor = new UploadedObjectProcessor(),
  moderationProvider: PostModerationProvider = new RequiredModerationProvider(),
): Promise<boolean> {
  const claimed = await claimJob(jobId);
  if (!claimed) return false;

  try {
    const media = await loadJobMedia(claimed.post_id);
    if (media.length === 0 || media.some((item) => !item.objectKey)) throw new Error("media_object_key_missing");

    for (const item of media) await mediaProcessor.process(item);

    const moderation = await moderationProvider.moderate({
      postId: claimed.post_id,
      caption: await loadCaption(claimed.post_id),
      media,
    });
    if (!moderation.allowed) throw new Error(moderation.code || "media_moderation_blocked");

    await pool.query(
      `update yunikov_v1.post_media set status = 'ready' where post_id = $1 and status = 'processing'`,
      [claimed.post_id],
    );
    await completeJob(jobId, true);
    return true;
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "post_processing_failed";
    await completeJob(jobId, false, code);
    return false;
  }
}

export async function processNextPostJob(): Promise<boolean> {
  const result = await pool.query(
    `select id from yunikov_v1.post_processing_jobs
      where status = 'pending'
      order by created_at asc
      limit 1`,
  );
  const job = result.rows[0];
  if (!job) return false;
  await processPostJob(job.id);
  return true;
}

if (process.env.RUN_POST_PROCESSING_WORKER === "true") {
  const pollMs = Math.max(250, Number(process.env.POST_PROCESSING_POLL_MS || 1000));
  const loop = async () => {
    while (true) {
      const processed = await processNextPostJob();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  };
  loop().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
