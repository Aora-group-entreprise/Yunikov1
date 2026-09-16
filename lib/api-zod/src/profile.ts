import { z } from "zod";

export const UsernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/);

export const UpdateProfileInput = z.object({
  username: UsernameSchema.optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  countryCode: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).nullable().optional(),
  isPrivate: z.boolean().optional(),
}).strict();

export const ProfileResponse = z.object({
  id: z.string().uuid(),
  username: UsernameSchema,
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isPrivate: z.boolean(),
  countryCode: z.string().nullable(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
export type ProfileResponse = z.infer<typeof ProfileResponse>;
