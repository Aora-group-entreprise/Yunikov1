import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { RequestUploadUrlsInput, RequestUploadUrlsResponse } from "@workspace/api-zod";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 15 * 60;

function getStorageConfig() {
  const bucket = process.env.POST_MEDIA_BUCKET;
  const region = process.env.POST_MEDIA_REGION;
  const accessKeyId = process.env.POST_MEDIA_ACCESS_KEY_ID;
  const secretAccessKey = process.env.POST_MEDIA_SECRET_ACCESS_KEY;
  const endpoint = process.env.POST_MEDIA_ENDPOINT;
  const publicBaseUrl = process.env.POST_MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");

  if (!bucket || !region || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new Error("post_storage_not_configured");
  }

  return { bucket, region, accessKeyId, secretAccessKey, endpoint, publicBaseUrl };
}

function safeExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match ? `.${match[1]}` : "";
}

function createObjectKey(userId: string, name: string): string {
  return `posts/${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${safeExtension(name)}`;
}

export async function requestPostUploadUrls(
  userId: string,
  input: RequestUploadUrlsInput,
): Promise<RequestUploadUrlsResponse> {
  const config = getStorageConfig();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: process.env.POST_MEDIA_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const uploads = await Promise.all(input.files.map(async (file) => {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("media_too_large");

    const objectKey = createObjectKey(userId, file.name);
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: file.contentType,
      ContentLength: file.size,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });

    return {
      uploadId: randomUUID(),
      uploadUrl,
      objectKey,
      publicUrl: `${config.publicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }));

  return { uploads };
}
