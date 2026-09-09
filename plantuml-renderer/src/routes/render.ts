import { Router } from "express";
import { validateRenderRequest } from "../middleware/request-validation.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { renderDiagram } from "../services/plantuml.service.js";
import type { RenderRequest } from "../types/render.js";

export const renderRouter = Router();

const CONTENT_TYPES = {
  svg: "image/svg+xml",
  png: "image/png",
} as const;

renderRouter.post("/render", rateLimit, validateRenderRequest, async (req, res, next) => {
  const { diagram, format } = req.body as RenderRequest;
  const start = Date.now();

  try {
    const image = await renderDiagram(diagram, format, req.log);
    const durationMs = Date.now() - start;

    // Deliberately not logging the diagram body itself (see README's
    // Logging section) — it may contain sensitive information.
    req.log.info({ format, durationMs, status: 200 }, "diagram rendered");

    res.setHeader("Content-Type", CONTENT_TYPES[format]);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(image);
  } catch (err) {
    req.log.info({ format, durationMs: Date.now() - start, status: "error" }, "diagram render failed");
    next(err);
  }
});
