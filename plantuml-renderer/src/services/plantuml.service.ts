import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import type { Logger } from "pino";
import { config } from "../config.js";
import { RenderError } from "../types/render.js";
import type { RenderFormat } from "../types/render.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";

const FORMAT_FLAGS: Record<RenderFormat, string> = {
  svg: "-tsvg",
  png: "-tpng",
};

// Bounds how many Java processes can run at once — see config's
// MAX_CONCURRENT_RENDERS / RENDER_QUEUE_LIMIT.
const limiter = new ConcurrencyLimiter(config.maxConcurrentRenders, config.renderQueueLimit);

export function assertPlantumlJarExists(): void {
  if (!existsSync(config.plantumlJar)) {
    throw new Error(
      `PLANTUML_JAR does not exist at "${config.plantumlJar}" — check the PLANTUML_JAR environment variable`
    );
  }
}

// Renders one diagram via `java -jar plantuml.jar -pipe <format flag>`.
// Uses PlantUML's stdin/stdout pipe mode (see the README's Architecture
// section) so no temporary files are created for a normal request, and
// execFile (never a shell) so the diagram text can never be interpreted as
// a shell command — see the README's Security section for the full threat
// model, including why PLANTUML_SECURITY_PROFILE=SANDBOX is set below.
export async function renderDiagram(diagram: string, format: RenderFormat, log: Logger): Promise<Buffer> {
  let release: (() => void) | undefined;
  try {
    release = await limiter.acquire();
  } catch {
    throw new RenderError("RENDER_OVERLOADED", 503, "The renderer is at capacity — try again shortly.");
  }

  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const args = [
        "-Djava.awt.headless=true",
        "-jar",
        config.plantumlJar,
        "-pipe",
        "-charset",
        "UTF-8",
        FORMAT_FLAGS[format],
      ];

      const child = execFile(
        "java",
        args,
        {
          timeout: config.plantumlTimeoutMs,
          killSignal: "SIGTERM",
          maxBuffer: 20 * 1024 * 1024, // generous headroom for large rendered images
          encoding: "buffer",
          env: {
            ...process.env,
            // Official PlantUML mitigation against diagrams using !include
            // (or similar directives) to read arbitrary local files or
            // fetch arbitrary URLs — see README's "External Resource
            // Access" section for the full threat model and its limits.
            PLANTUML_SECURITY_PROFILE: "SANDBOX",
          },
        },
        (error, stdout) => {
          if (error) {
            if ((error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
              log.warn({ format }, "plantuml render timed out");
              reject(new RenderError("RENDER_TIMEOUT", 504, "PlantUML rendering exceeded the configured timeout."));
              return;
            }
            log.warn({ format, err: error.message }, "plantuml process exited with an error");
            reject(new RenderError("PLANTUML_ERROR", 400, "Unable to render PlantUML diagram."));
            return;
          }

          const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? "");
          if (buffer.length === 0) {
            log.warn({ format }, "plantuml produced no output");
            reject(new RenderError("PLANTUML_ERROR", 400, "Unable to render PlantUML diagram."));
            return;
          }

          resolve(buffer);
        }
      );

      child.stdin?.on("error", () => {
        // Writing to a process that's already exited (e.g. it rejected the
        // input immediately) throws EPIPE — the execFile callback above
        // still fires with the process's real exit info, so it's safe to
        // swallow this specific error rather than let it crash the request.
      });
      child.stdin?.write(diagram, "utf-8");
      child.stdin?.end();
    });
  } finally {
    release?.();
  }
}
