import { z } from "zod";
import { config } from "../config.js";

export const RENDER_FORMATS = ["svg", "png"] as const;
export type RenderFormat = (typeof RENDER_FORMATS)[number];

export const renderRequestSchema = z.object({
  diagram: z
    .string({ required_error: "diagram is required", invalid_type_error: "diagram must be a string" })
    .min(1, "diagram must not be empty")
    .max(config.maxDiagramSize, "diagram exceeds the maximum allowed size"),
  format: z.enum(RENDER_FORMATS).default("svg"),
});

export type RenderRequest = z.infer<typeof renderRequestSchema>;

export const ERROR_CODES = [
  "INVALID_REQUEST",
  "INVALID_FORMAT",
  "DIAGRAM_TOO_LARGE",
  "PLANTUML_ERROR",
  "RENDER_TIMEOUT",
  "RENDER_OVERLOADED",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: ErrorCode;
  message: string;
  requestId?: string;
}

export class RenderError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
