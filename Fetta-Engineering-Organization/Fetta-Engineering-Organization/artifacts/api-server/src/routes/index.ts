import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import phase1Router from "./phase1";
import mercuryRouter from "./mercury";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(phase1Router);
router.use(mercuryRouter);

export default router;
