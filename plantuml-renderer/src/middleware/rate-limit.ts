import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

// Deliberately simple fixed-window limiter, keyed by IP — sufficient for a
// single-instance deployment. A multi-instance deployment behind a shared
// gateway should rate-limit there instead; see README's Rate Limiting
// section for that trade-off.
const windowStart = new Map<string, { start: number; count: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = windowStart.get(key);

  if (!entry || now - entry.start >= config.rateLimitWindowMs) {
    windowStart.set(key, { start: now, count: 1 });
    next();
    return;
  }

  entry.count += 1;
  if (entry.count > config.rateLimitMaxRequests) {
    res.setHeader("Retry-After", Math.ceil((entry.start + config.rateLimitWindowMs - now) / 1000).toString());
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(429).json({
      error: "RENDER_OVERLOADED",
      message: "Rate limit exceeded. Try again later.",
      requestId: req.requestId,
    });
    return;
  }

  next();
}
