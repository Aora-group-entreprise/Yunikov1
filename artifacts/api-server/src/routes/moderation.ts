import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { blockUser, listBlockedUsers, reportEntity, unblockUser, type ReportInput } from "../services/moderation.service";

const router: IRouter = Router();

function userId(req: AuthenticatedRequest) {
  if (!req.userId) throw new Error("unauthorized");
  return req.userId;
}

router.post("/me/reports", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = req.body as Partial<ReportInput>;
    if (!body.entityType || !body.entityId || !body.reason) {
      res.status(400).json({ error: "invalid_report" });
      return;
    }
    res.status(201).json(await reportEntity(userId(req), body as ReportInput));
  } catch (error) {
    if (error instanceof Error) {
      const status: Record<string, number> = {
        invalid_report_reason: 400,
        entity_not_found: 404,
        rate_limited: 429,
      };
      if (status[error.message]) {
        res.status(status[error.message]).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

router.post("/me/blocks/:targetUserId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await blockUser(userId(req), String(req.params.targetUserId));
    res.status(204).end();
  } catch (error) {
    if (error instanceof Error) {
      const status: Record<string, number> = {
        cannot_block_self: 400,
        user_not_found: 404,
        rate_limited: 429,
      };
      if (status[error.message]) {
        res.status(status[error.message]).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

router.delete("/me/blocks/:targetUserId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await unblockUser(userId(req), String(req.params.targetUserId));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/me/blocks", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await listBlockedUsers(userId(req)));
  } catch (error) {
    next(error);
  }
});

export default router;
