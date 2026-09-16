import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import followRouter from "./follow";
import postRouter from "./post";
import postUploadRouter from "./post-upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(followRouter);
router.use(postRouter);
router.use(postUploadRouter);

export default router;
