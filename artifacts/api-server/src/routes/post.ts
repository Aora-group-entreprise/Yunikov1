import { Router, type IRouter } from "express";
import { CreatePostInput, UpdatePostInput } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { createPost, updatePost, deletePost } from "../services/post.service";

const router: IRouter = Router();

router.post("/posts", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = CreatePostInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_post", issues: parsed.error.issues });
    return;
  }
  try {
    res.status(201).json(await createPost(req.userId!, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "managed_auth_not_configured") {
      res.status(503).json({ error: "auth_not_configured" });
      return;
    }
    throw error;
  }
});

router.patch("/posts/:postId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = UpdatePostInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_post", issues: parsed.error.issues });
    return;
  }
  try {
    res.json(await updatePost(req.userId!, String(req.params.postId), parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "post_not_found") {
      res.status(404).json({ error: "post_not_found" });
      return;
    }
    throw error;
  }
});

router.delete("/posts/:postId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await deletePost(req.userId!, String(req.params.postId));
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "post_not_found") {
      res.status(404).json({ error: "post_not_found" });
      return;
    }
    throw error;
  }
});

export default router;
