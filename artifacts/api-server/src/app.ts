import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { participantMiddleware } from "./middlewares/participantMiddleware";
import { organizerMiddleware } from "./middlewares/organizerMiddleware";
import path from "node:path";

const app: Express = express();
if (process.env.RUNTIME_HOST === "cpanel") app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: process.env.PUBLIC_APP_ORIGIN || true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);
app.use(participantMiddleware);
app.use(["/api/admin", "/api/organizer-auth"], organizerMiddleware);

app.use("/api", (req, res, next) => {
  const loginPaths = ["/participant-auth/signin", "/participant-auth/signout", "/organizer-auth/signin", "/organizer-auth/signout"];
  if (process.env.MIGRATION_READ_ONLY === "true" && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !loginPaths.includes(req.path)) {
    res.status(503).json({ error: "Registration is temporarily paused for a secure data migration. Please try again later." });
    return;
  }
  next();
});
app.use("/api", router);
// Unknown API URLs must never return an HTML application page.
app.use("/api", (_req, res) => { res.status(404).json({ error: "API route not found" }); });

if (process.env.STATIC_SITE_DIR) {
  const site = path.resolve(process.env.STATIC_SITE_DIR);
  app.use(express.static(site, { index: false, dotfiles: "deny" }));
  app.get(["/", "/register", "/admin", "/archive/2025"], (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(site, "index.html"));
  });
}

export default app;
