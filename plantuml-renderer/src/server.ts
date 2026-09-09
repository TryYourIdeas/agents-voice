import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { assertPlantumlJarExists } from "./services/plantuml.service.js";

// Fail fast on bad/missing configuration rather than surfacing it as a
// confusing error on the first real request.
try {
  assertPlantumlJarExists();
} catch (err) {
  logger.fatal({ err }, "startup check failed");
  process.exit(1);
}

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "plantuml-renderer listening");
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  // Stop accepting new connections; let in-flight requests finish.
  server.close((err) => {
    if (err) {
      logger.error({ err }, "error during server close");
      process.exit(1);
    }
    logger.info("server closed cleanly");
    process.exit(0);
  });

  // Force-exit if requests haven't finished within the shutdown window —
  // important under container orchestration, which sends SIGKILL shortly
  // after SIGTERM anyway.
  setTimeout(() => {
    logger.warn("forcing shutdown after timeout");
    process.exit(1);
  }, config.shutdownTimeoutMs).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
