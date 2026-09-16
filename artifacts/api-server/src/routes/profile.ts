import { Router, type IRouter } from "express";
import { UpdateProfileInput } from "@workspace/api-zod";
import { getProfileByUsername, updateOwnProfile } from "../services/profile.service";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/profiles/:username", async (req, res) => {
  const profile = await getProfileByUsername(req.params.username);
  if (!profile) {
    res.status(404).json({ error: "profile_not_found" });
    return;
  }
  res.json(profile);
});

router.patch("/me/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = UpdateProfileInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_profile", issues: parsed.error.issues });
    return;
  }

  try {
    const profile = await updateOwnProfile(req.userId!, parsed.data);
    res.json(profile);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    if (error instanceof Error && error.message === "profile_not_found") {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }
    throw error;
  }
});

export default router;
