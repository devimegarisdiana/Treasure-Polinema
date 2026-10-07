import { Router, type IRouter } from "express";
import healthRouter from "./health";
import registrationsRouter from "./registrations";
import authRouter from "./auth";
import storageRouter from "./storage";
import adminRouter from "./admin";
import participantAuthRouter from "./participantAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(registrationsRouter);
router.use(adminRouter);
router.use(participantAuthRouter);

export default router;
