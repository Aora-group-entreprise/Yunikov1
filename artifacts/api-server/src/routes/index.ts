import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import followRouter from "./follow";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(followRouter);

export default router;
