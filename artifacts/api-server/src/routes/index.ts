import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import socialRouter from "./social";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(socialRouter);

export default router;
