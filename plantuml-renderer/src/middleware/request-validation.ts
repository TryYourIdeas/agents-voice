import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { renderRequestSchema } from "../types/render.js";
import { RenderError } from "../types/render.js";

// Validates the /render request body before anything touches PlantUML.
// Maps zod's generic issues onto the specific documented error codes
// (INVALID_FORMAT vs. DIAGRAM_TOO_LARGE vs. INVALID_REQUEST) — see
// README's Error Model section.
export function validateRenderRequest(req: Request, _res: Response, next: NextFunction): void {
  const result = renderRequestSchema.safeParse(req.body);

  if (!result.success) {
    next(toRenderError(result.error));
    return;
  }

  req.body = result.data;
  next();
}

function toRenderError(error: ZodError): RenderError {
  const formatIssue = error.issues.find((issue) => issue.path[0] === "format");
  if (formatIssue) {
    return new RenderError("INVALID_FORMAT", 400, "Format must be either 'svg' or 'png'.");
  }

  const sizeIssue = error.issues.find(
    (issue) => issue.path[0] === "diagram" && issue.code === "too_big"
  );
  if (sizeIssue) {
    return new RenderError("DIAGRAM_TOO_LARGE", 400, "diagram exceeds the maximum allowed size.");
  }

  const message = error.issues[0]?.message ?? "Invalid request body.";
  return new RenderError("INVALID_REQUEST", 400, message);
}
