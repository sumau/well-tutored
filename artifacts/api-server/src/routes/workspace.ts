import { Router, type IRouter } from "express";
import accountsRouter from "./workspace-accounts";
import profileRouter from "./workspace-profile";
import resourcesRouter from "./workspace-resources";
import sessionRouter from "./workspace-session";
import tutorsRouter from "./workspace-tutors";

const router: IRouter = Router();

router.use(sessionRouter);
router.use(resourcesRouter);
router.use(profileRouter);
router.use(tutorsRouter);
router.use(accountsRouter);

export default router;