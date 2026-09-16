import { z } from "zod";

export const PostVisibility = z.enum(["public", "followers", "private"]);
export const PostStatus = z.enum(["draft", "processing", "ready", "failed"]);

export const CreatePostInput = z.object({
  caption: z.string().max(5000).nullable().optional(),
  visibility: PostVisibility.default("public"),
  media: z.array(z.object({
    url: z.string().url().max(4096),
    objectKey: z.string().min(1).max(1024),
    contentType: z.string().min(1).max(127),
    fileSize: z.number().int().positive().max(100 * 1024 * 1024),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    blurhash: z.string().max(128).nullable().optional(),
    position: z.number().int().nonnegative().default(0),
  })).min(1).max(10),
});

export const UpdatePostInput = z.object({
  caption: z.string().max(5000).nullable().optional(),
  visibility: PostVisibility.optional(),
}).strict();

export const PostResponse = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  caption: z.string().nullable(),
  visibility: PostVisibility,
  status: PostStatus,
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  saveCount: z.number().int().nonnegative(),
  shareCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  media: z.array(z.object({
    id: z.string().uuid(),
    url: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    blurhash: z.string().nullable(),
    position: z.number().int(),
    status: z.string(),
  })),
});

export type CreatePostInput = z.infer<typeof CreatePostInput>;
export type UpdatePostInput = z.infer<typeof UpdatePostInput>;
export type PostResponse = z.infer<typeof PostResponse>;
