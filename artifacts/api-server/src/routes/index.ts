import { Router, type IRouter } from "express";
import healthRouter from "./health";
import registrationsRouter from "./registrations";
import authRouter from "./auth";
import storageRouter from "./storage";
import adminRouter from "./admin";
import participantAuthRouter from "./participantAuth";
import organizerAuthRouter from "./organizerAuth";

const router: IRouter = Router();

router.use(healthRouter);
if (process.env.AUTH_REPLIT_ENABLED !== "false") router.use(authRouter);
router.use(storageRouter);
router.use(registrationsRouter);
router.use(adminRouter);
router.use(participantAuthRouter);
router.use(organizerAuthRouter);

export default router;
