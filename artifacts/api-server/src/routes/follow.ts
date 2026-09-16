import { Router, type IRouter } from "express";
import { FollowTargetInput } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  acceptFollowRequest,
  listFollowers,
  listFollowing,
  rejectFollowRequest,
  removeFollower,
  toggleFollow,
} from "../services/follow.service";

const router: IRouter = Router();

function requireUser(req: AuthenticatedRequest): string {
  if (!req.userId) throw new Error("unauthorized");
  return req.userId;
}

router.post("/me/follows", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = FollowTargetInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_follow", issues: parsed.error.issues });
      return;
    }
    const result = await toggleFollow(requireUser(req), parsed.data.userId);
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      const statuses: Record<string, number> = {
        user_not_found: 404,
        cannot_follow_self: 400,
        blocked_relationship: 403,
      };
      const status = statuses[error.message];
      if (status) {
        res.status(status).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
});

router.post("/me/follow-requests/:followerId/accept", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await acceptFollowRequest(requireUser(req), String(req.params.followerId));
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "follow_request_not_found") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post("/me/follow-requests/:followerId/reject", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await rejectFollowRequest(requireUser(req), String(req.params.followerId));
    res.status(204).end();
  } catch (error) {
    if (error instanceof Error && error.message === "follow_request_not_found") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.delete("/me/followers/:followerId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await removeFollower(requireUser(req), String(req.params.followerId));
    res.status(204).end();
  } catch (error) {
    if (error instanceof Error && error.message === "follow_not_found") {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/me/followers", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await listFollowers(requireUser(req)));
  } catch (error) {
    next(error);
  }
});

router.get("/me/following", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await listFollowing(requireUser(req)));
  } catch (error) {
    next(error);
  }
});

export default router;
