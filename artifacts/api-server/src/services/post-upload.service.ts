import { randomUUID } from "node:crypto";
import type { RequestUploadUrlsInput, RequestUploadUrlsResponse } from "@workspace/api-zod";

/**
 * Storage provider boundary.
 *
 * A real object-storage adapter must be configured before signed uploads are
 * issued. Returning synthetic URLs here would make the client believe media
 * was uploaded when it was not, so this boundary fails closed.
 */
export async function requestPostUploadUrls(
  _userId: string,
  input: RequestUploadUrlsInput,
): Promise<RequestUploadUrlsResponse> {
  if (process.env.POST_MEDIA_UPLOAD_BASE_URL) {
    throw new Error("post_storage_adapter_not_implemented");
  }

  void randomUUID;
  void input;
  throw new Error("post_storage_not_configured");
}
