import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contentRouter from "./content";
import enquiriesRouter from "./enquiries";
import workspaceRouter from "./workspace";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contentRouter);
router.use(enquiriesRouter);
router.use(workspaceRouter);

export default router;
