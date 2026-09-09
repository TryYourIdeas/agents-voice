import type { NextFunction, Request, Response } from "express";
import type { ApiError } from "../types/render.js";
import { RenderError } from "../types/render.js";

function send(res: Response, req: Request, status: number, body: ApiError): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ ...body, requestId: req.requestId });
}

// Express's body-parser (express.json()) throws a plain error with these
// fields when the raw request body exceeds its configured limit — caught
// here rather than in request-validation.ts since it happens before the
// body is even parsed.
function isPayloadTooLarge(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.too.large";
}

// Centralized error handler — the only place that turns an error into a
// client-facing response, so stack traces / internal details can never leak
// through some other code path. Must be registered last, after all routes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof RenderError) {
    if (err.status >= 500) {
      req.log.error({ err }, "render error");
    } else {
      req.log.warn({ code: err.code }, "render request rejected");
    }
    send(res, req, err.status, { error: err.code, message: err.message });
    return;
  }

  if (isPayloadTooLarge(err)) {
    req.log.warn("request body exceeded size limit");
    send(res, req, 413, { error: "DIAGRAM_TOO_LARGE", message: "Request body exceeds the maximum allowed size." });
    return;
  }

  // Anything else is unexpected — log full detail server-side only.
  req.log.error({ err }, "unhandled error");
  send(res, req, 500, { error: "INTERNAL_ERROR", message: "An unexpected error occurred while rendering the diagram." });
}

export function notFoundHandler(req: Request, res: Response): void {
  send(res, req, 404, { error: "INVALID_REQUEST", message: "Not found." });
}
