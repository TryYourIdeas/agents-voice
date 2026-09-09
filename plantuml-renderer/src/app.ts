import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { renderRouter } from "./routes/render.js";
import { logger } from "./logger.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      // Keep request logs to the metadata described in the README's
      // Logging section — pino-http's defaults already exclude the body.
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    })
  );

  app.use(
    cors({
      origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(",").map((s) => s.trim()),
    })
  );

  // Body-size limit set above MAX_DIAGRAM_SIZE to leave headroom for JSON
  // escaping overhead; the exact documented limit is still enforced on the
  // decoded diagram string by the zod schema in request-validation.ts.
  app.use(express.json({ limit: config.maxDiagramSize * 2 }));

  // Lightweight — must not render a diagram on every check, per the spec.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(renderRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
