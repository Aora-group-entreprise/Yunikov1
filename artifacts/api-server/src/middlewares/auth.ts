import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { verifyAccessToken } from "../services/auth.service";

export type AuthenticatedRequest = Request & { userId?: string; sessionId?: string };

function readBearerToken(req: Request): string | null {
  const value = req.header("authorization");
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req);
  const identity = token ? verifyAccessToken(token) : null;
  if (!identity) { res.status(401).json({ error: "unauthorized" }); return; }
  const result = await pool.query<{ user_id: string }>(`select user_id from yunikov_v1.auth_sessions where id=$1 and user_id=$2 and revoked_at is null and expires_at>now()`, [identity.sessionId, identity.userId]);
  if (!result.rows[0]) { res.status(401).json({ error: "session_expired" }); return; }
  req.userId = identity.userId;
  req.sessionId = identity.sessionId;
  next();
}
