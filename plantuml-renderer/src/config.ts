// All runtime configuration lives here, read once at startup and validated
// eagerly — a bad value should fail the process immediately, not surface as
// a confusing error on the first request.

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid configuration: ${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export const config = {
  port: intFromEnv("PORT", 3000),
  plantumlJar: process.env.PLANTUML_JAR ?? "/opt/plantuml/plantuml.jar",
  plantumlTimeoutMs: intFromEnv("PLANTUML_TIMEOUT_MS", 10_000),
  maxDiagramSize: intFromEnv("MAX_DIAGRAM_SIZE", 1_048_576), // 1 MB
  maxConcurrentRenders: intFromEnv("MAX_CONCURRENT_RENDERS", 2),
  renderQueueLimit: intFromEnv("RENDER_QUEUE_LIMIT", 20),
  logLevel: process.env.LOG_LEVEL ?? "info",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  rateLimitWindowMs: intFromEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMaxRequests: intFromEnv("RATE_LIMIT_MAX_REQUESTS", 30),
  shutdownTimeoutMs: intFromEnv("SHUTDOWN_TIMEOUT_MS", 10_000),
} as const;

if (config.corsOrigin === "*" && process.env.NODE_ENV === "production") {
  // Not fatal — documented in the README as a development-only default —
  // but worth a startup-time warning since it's easy to carry into prod
  // by accident.
  // eslint-disable-next-line no-console
  console.warn(
    "[config] CORS_ORIGIN=* in a production environment allows any origin to call this service. " +
      "Set CORS_ORIGIN to a comma-separated allowlist for production deployments."
  );
}
