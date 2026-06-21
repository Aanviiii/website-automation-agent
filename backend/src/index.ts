/**
 * Express server entry point.
 * - serves the automation API under /api
 * - serves captured screenshots as static files under /screenshots
 */
import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import automationRoutes from "./routes/automation.routes";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((s) => s.trim()),
  })
);
app.use(express.json());

// static screenshots: GET /screenshots/<file>.png
app.use("/screenshots", express.static(path.resolve(process.cwd(), "screenshots")));

// health check (Render pings this)
app.get("/health", (_req, res) => res.json({ ok: true, service: "automation-agent" }));

app.use("/api", automationRoutes);

app.listen(env.port, () => {
  logger.success(`Backend listening on http://localhost:${env.port}`);
  logger.info(`Grok enabled: ${env.grok.enabled} | Qdrant enabled: ${env.qdrant.enabled}`);
});
