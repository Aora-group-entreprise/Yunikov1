import type { PreparedMedia } from "./mediaPipeline";

export type UploadDescriptor = {
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
};

export type CreatedPostMedia = {
  url: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  position: number;
};

export type CreatePostInput = {
  caption?: string | null;
  visibility?: "public" | "followers" | "private";
  media: CreatedPostMedia[];
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body.error === "string" ? body.error : "api_request_failed";
    throw new Error(error);
  }
  return body as T;
}

export async function requestUploadUrls(files: File[]): Promise<UploadDescriptor[]> {
  const response = await fetch(`${API_BASE}/posts/upload-urls`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: files.map((file) => ({
        name: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      })),
    }),
  });
  const payload = await readJson<{ uploads: UploadDescriptor[] }>(response);
  if (!Array.isArray(payload.uploads) || payload.uploads.length !== files.length) {
    throw new Error("invalid_upload_response");
  }
  return payload.uploads;
}

export async function uploadDirectly(upload: UploadDescriptor, file: File): Promise<void> {
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error(`upload_failed:${response.status}`);
}

export async function uploadPostMedia(media: PreparedMedia[]): Promise<CreatedPostMedia[]> {
  const uploads = await requestUploadUrls(media.map((item) => item.file));
  const results = await Promise.all(
    media.map(async (item, index) => {
      await uploadDirectly(uploads[index], item.file);
      return {
        url: uploads[index].objectKey,
        width: item.width,
        height: item.height,
        blurhash: item.blurhash,
        position: item.position,
      } satisfies CreatedPostMedia;
    }),
  );
  return results;
}

export async function createPost(input: CreatePostInput): Promise<unknown> {
  const response = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function publishPost(
  media: PreparedMedia[],
  options: Omit<CreatePostInput, "media">,
): Promise<unknown> {
  const uploadedMedia = await uploadPostMedia(media);
  return createPost({ ...options, media: uploadedMedia });
}
