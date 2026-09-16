import { z } from "zod";

export const RequestUploadUrlsInput = z.object({
  files: z.array(z.object({
    name: z.string().min(1).max(255),
    contentType: z.string().min(1).max(128),
    size: z.number().int().positive().max(100 * 1024 * 1024),
  }).strict()).min(1).max(10),
}).strict();

export const UploadUrlResponse = z.object({
  uploadId: z.string().uuid(),
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresAt: z.string(),
});

export const RequestUploadUrlsResponse = z.object({
  uploads: z.array(UploadUrlResponse),
});

export type RequestUploadUrlsInput = z.infer<typeof RequestUploadUrlsInput>;
