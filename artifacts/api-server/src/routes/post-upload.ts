import { Router, type IRouter } from "express";
import { RequestUploadUrlsInput } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { requestPostUploadUrls } from "../services/post-upload.service";

const router: IRouter = Router();

router.post("/posts/upload-urls", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = RequestUploadUrlsInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_upload_request", issues: parsed.error.issues });
    return;
  }

  try {
    res.json(await requestPostUploadUrls(req.userId!, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "post_storage_not_configured") {
      res.status(503).json({ error: "post_storage_not_configured" });
      return;
    }
    if (error instanceof Error && error.message === "post_storage_adapter_not_implemented") {
      res.status(503).json({ error: "post_storage_adapter_not_ready" });
      return;
    }
    throw error;
  }
});

export default router;
