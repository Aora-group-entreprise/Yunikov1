import type { Request, Response, NextFunction } from "express";

export type AuthenticatedRequest = Request & { userId?: string };

function readBearerToken(req: Request): string | null {
  const value = req.header("authorization");
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Phase 1 auth boundary.
 * The production JWT verifier is deliberately isolated here so route handlers
 * never make authentication decisions themselves.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = readBearerToken(req);
  const userId = token ? process.env.AUTH_TEST_USER_ID : undefined;

  if (!token || !userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  req.userId = userId;
  next();
}
