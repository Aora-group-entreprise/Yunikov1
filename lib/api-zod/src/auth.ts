import { z } from "zod";

export const RegisterInput = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
});

export const LoginInput = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(128),
});

export const LogoutInput = z.object({
  scope: z.enum(["current", "all"]).default("current"),
});

export const PasswordResetRequestInput = z.object({
  email: z.string().trim().email().max(320),
});

export const AuthAcceptedResponse = z.object({
  accepted: z.boolean(),
});

export type RegisterInput = z.infer<typeof RegisterInput>;
export type LoginInput = z.infer<typeof LoginInput>;
export type LogoutInput = z.infer<typeof LogoutInput>;
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestInput>;
