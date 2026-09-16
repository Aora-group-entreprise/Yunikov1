import { z } from "zod";

export const FollowStatus = z.enum(["pending", "accepted"]);

export const FollowTargetInput = z.object({
  userId: z.string().uuid(),
}).strict();

export const FollowResponse = z.object({
  followerId: z.string().uuid(),
  followingId: z.string().uuid(),
  status: FollowStatus,
});

export const FollowRequestResponse = z.object({
  followerId: z.string().uuid(),
  followingId: z.string().uuid(),
  status: z.literal("pending"),
});

export const FollowListItem = z.object({
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});

export type FollowTargetInput = z.infer<typeof FollowTargetInput>;
export type FollowResponse = z.infer<typeof FollowResponse>;
export type FollowListItem = z.infer<typeof FollowListItem>;
