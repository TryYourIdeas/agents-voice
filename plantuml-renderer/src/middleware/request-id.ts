import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Accepts a client-supplied X-Request-ID (bounded/sanitized so a client
// can't inject arbitrary header content into logs), or generates one.
// Always echoed back on the response — see README's "Request ID" section.
const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]+$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header("X-Request-ID");
  const requestId =
    provided && provided.length <= MAX_REQUEST_ID_LENGTH && SAFE_REQUEST_ID.test(provided)
      ? provided
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}
