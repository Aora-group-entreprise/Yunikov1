import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import followRouter from "./follow";
import postRouter from "./post";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(followRouter);
router.use(postRouter);

export default router;
