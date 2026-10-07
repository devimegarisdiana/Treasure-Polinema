import { Router, type IRouter } from "express";
import healthRouter from "./health";
import registrationsRouter from "./registrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(registrationsRouter);

export default router;
