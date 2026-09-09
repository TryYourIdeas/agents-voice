# plantuml-renderer

A standalone HTTP microservice that renders [PlantUML](https://plantuml.com/) diagram
definitions to SVG or PNG and returns the image directly in the response. Lets a consuming
application render diagrams without installing Java or PlantUML itself.

## Architecture

```text
                   HTTP Client
                       │
                       ▼
              ┌─────────────────┐
              │ Express Server  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Request         │
              │ Validation      │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Render Service  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Java / PlantUML │
              └────────┬────────┘
                       │
                       ▼
                  SVG / PNG
                       │
                       ▼
                 HTTP Response
```

PlantUML-specific logic is isolated in `src/services/plantuml.service.ts` so it can be replaced
or upgraded independently of the HTTP layer. Rendering uses PlantUML's `-pipe` mode (stdin in,
stdout out) via Node's `execFile` — no temporary files, and no shell is ever invoked (see
[Security](#security)).

## Running locally

Requires Node.js 22+, and a JRE + the PlantUML jar available locally (or just use Docker — see
below, which is the easiest way to get a correct environment).

```bash
npm install
npm run dev
```

By default this expects `PLANTUML_JAR` to point at a local `plantuml.jar` (see
[Configuration](#configuration)) and a `java` binary on `PATH`.

## Running tests

```bash
npm test
```

Tests mock `child_process.execFile` for the render/timeout/error paths (see
`test/mock-exec-file.ts`), so `npm test` does not require Java or PlantUML to be installed and
runs identically in any environment, including CI. `npm run dev` / the Docker image are what
exercise the real PlantUML invocation.

## Building

```bash
npm run build
```

Compiles TypeScript to `dist/`.

## Docker build

```bash
docker build -t plantuml-renderer .
```

Pin a specific PlantUML release at build time (defaults to `1.2024.7`):

```bash
docker build --build-arg PLANTUML_VERSION=1.2024.7 -t plantuml-renderer .
```

## Docker run

```bash
docker run --rm -p 3000:3000 plantuml-renderer
```

Or via Compose (includes the recommended security/resource limits — see
[Security](#security)):

```bash
docker compose up --build
```

## API

### `POST /render`

```http
Content-Type: application/json
```

```json
{
  "diagram": "@startuml\nAlice -> Bob: Hello\nBob --> Alice: Hi!\n@enduml",
  "format": "svg"
}
```

- `diagram` (required, string, non-empty, max `MAX_DIAGRAM_SIZE` bytes) — the PlantUML source.
- `format` (optional, `"svg"` or `"png"`, default `"svg"`).

**Success** — the image is returned directly as the response body (not wrapped in JSON or
base64), so it's directly usable by a browser or `fetch()`:

```http
HTTP/1.1 200 OK
Content-Type: image/svg+xml
X-Content-Type-Options: nosniff
```

```js
const response = await fetch("/render", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ diagram, format: "svg" }),
});
const image = await response.blob();
```

**Example — SVG:**

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"diagram": "@startuml\nAlice -> Bob: Hello\n@enduml", "format": "svg"}' \
  -o diagram.svg
```

**Example — PNG:**

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"diagram": "@startuml\nAlice -> Bob: Hello\n@enduml", "format": "png"}' \
  -o diagram.png
```

More example diagrams are in [`examples/`](./examples).

### `GET /health`

```json
{ "status": "ok" }
```

Always `200`. Lightweight — does not render a diagram on every check.

### `GET /ready`

Same shape as `/health`. Provided separately in case a deployment wants to distinguish
liveness from readiness later (currently identical).

## Error model

All errors (including from `/render`) use a consistent shape:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description.",
  "requestId": "abc123"
}
```

| HTTP status | `error` code | Meaning |
|---|---|---|
| 400 | `INVALID_REQUEST` | Body failed validation (e.g. `diagram` missing or not a string) |
| 400 | `INVALID_FORMAT` | `format` was not `"svg"` or `"png"` |
| 400 / 413 | `DIAGRAM_TOO_LARGE` | `diagram` exceeded `MAX_DIAGRAM_SIZE`, or the raw request body was too large |
| 400 | `PLANTUML_ERROR` | PlantUML failed to produce output (see note below) |
| 429 | `RENDER_OVERLOADED` | Rate limit exceeded |
| 503 | `RENDER_OVERLOADED` | Concurrent-render queue is full |
| 504 | `RENDER_TIMEOUT` | Rendering exceeded `PLANTUML_TIMEOUT_MS` |
| 500 | `INTERNAL_ERROR` | Unexpected failure — no further detail is exposed to the client |

Stack traces, filesystem paths, and Java exception detail are never returned to the client —
they're logged server-side only (see [Logging](#logging)).

**Important PlantUML-specific note:** PlantUML is deliberately forgiving — most malformed input
still renders successfully as an "error diagram" image (a `200` response depicting the parse
error visually) rather than failing the process. `PLANTUML_ERROR` is only returned when the
PlantUML process actually exits with a failure or produces no output at all (e.g. it crashes, or
a genuinely unsupported construct causes zero output). This is documented PlantUML behavior, not
a limitation of this service — if you need to detect "the diagram doesn't look like what the user
intended," you'll need to inspect the rendered image, not rely solely on the HTTP status.

## Configuration

All via environment variables, validated at startup (the process exits immediately on invalid
config rather than failing on the first request):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `PLANTUML_JAR` | `/opt/plantuml/plantuml.jar` | Path to the PlantUML jar |
| `PLANTUML_TIMEOUT_MS` | `10000` | Hard timeout per render; the process is killed and `RENDER_TIMEOUT` (504) returned if exceeded |
| `MAX_DIAGRAM_SIZE` | `1048576` (1 MB) | Max `diagram` length in bytes |
| `MAX_CONCURRENT_RENDERS` | `2` | Max simultaneous Java processes |
| `RENDER_QUEUE_LIMIT` | `20` | Requests beyond `MAX_CONCURRENT_RENDERS` queue up to this many before `RENDER_OVERLOADED` (503) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window, per client IP |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Max requests per window per IP before `RENDER_OVERLOADED` (429) |
| `CORS_ORIGIN` | `*` | `*` or a comma-separated origin allowlist — see [CORS](#cors) |
| `LOG_LEVEL` | `info` | pino log level |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Max time to let in-flight requests finish during graceful shutdown |

## CORS

`CORS_ORIGIN=*` (the default) is suitable for development only — it lets any website's
JavaScript call this service directly. For production, set a comma-separated allowlist:

```bash
CORS_ORIGIN=https://example.com,https://app.example.com
```

The service logs a startup warning if `CORS_ORIGIN=*` and `NODE_ENV=production`.

## Rate limiting

A simple fixed-window, per-IP limiter is built in (`RATE_LIMIT_WINDOW_MS` /
`RATE_LIMIT_MAX_REQUESTS`), sufficient for a single-instance deployment. If you run multiple
instances behind a shared gateway/ingress/reverse proxy, rate-limit there instead — this
in-process limiter is per-instance and won't coordinate across replicas.

## Concurrency and resource limits

- `MAX_CONCURRENT_RENDERS` bounds how many Java processes run at once; excess requests queue
  (up to `RENDER_QUEUE_LIMIT`) rather than spawning unbounded processes.
- `PLANTUML_TIMEOUT_MS` bounds how long any single render can run; the child process is killed
  on timeout.
- `MAX_DIAGRAM_SIZE` and the request body-size limit bound memory use per request.

## Logging

Structured JSON logs via [pino](https://getpino.io/). Each request logs (at minimum): timestamp,
request ID, method, path, status, and for `/render` specifically: format and render duration.
**The full diagram text is never logged** — diagrams may contain sensitive information the
client didn't intend to persist to logs.

## Request ID

Every response includes `X-Request-ID`. If the client sends one (validated for length and
character set), it's echoed back; otherwise one is generated. Also included in every JSON error
body. Useful for correlating a client-side report with server logs.

## Graceful shutdown

On `SIGTERM`/`SIGINT`, the server stops accepting new connections, lets in-flight requests finish
(up to `SHUTDOWN_TIMEOUT_MS`), then exits. Important for container orchestrators that send
`SIGTERM` before `SIGKILL` during a rolling deploy or scale-down.

## Security

This service executes an external process (Java + PlantUML) against **untrusted, arbitrary
user-provided input**. Treat the container as the primary security boundary. What's implemented:

- **No shell execution** — `child_process.execFile` is used, never `exec()`; the diagram text is
  passed as data (via stdin), never interpolated into a command line, so it can never be
  interpreted as shell syntax or inject extra arguments.
- **No client-controlled arguments** — the client can only choose `svg` or `png`, mapped
  internally to a fixed `-tsvg`/`-tpng` flag. The client can never influence Java arguments,
  PlantUML flags, file paths, or environment variables.
- **Rendering timeout** — bounds worst-case CPU/time per request (`PLANTUML_TIMEOUT_MS`).
- **Request size limits** — bounds worst-case memory per request (`MAX_DIAGRAM_SIZE`).
- **Concurrency limit** — bounds how many Java processes can run at once
  (`MAX_CONCURRENT_RENDERS`), so the service can't be used to fork-bomb the host.
- **Non-root container user** — the production image runs as an unprivileged `plantuml` user
  (see the Dockerfile).
- **No stack traces / internal detail in responses** — see [Error model](#error-model).

Recommended (and enabled by the bundled `docker-compose.yml`) container-level hardening, not all
of which can be expressed in a Dockerfile itself:

```yaml
read_only: true
tmpfs:
  - /tmp
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
pids_limit: 128
deploy:
  resources:
    limits:
      cpus: "1"
      memory: 512M
```

`read_only: true` requires a writable `/tmp` (mounted as `tmpfs` above) since Node/npm may want
scratch space there; the application itself does not write to disk during a request (rendering
uses stdin/stdout pipes, not temp files).

### External resource access (PlantUML-specific)

PlantUML supports directives (notably `!include`, and some preprocessor/creole features) that
can read local files or fetch remote URLs — a real risk when diagram text comes from untrusted
users, since it could otherwise be used to probe internal network services, read files off the
container's filesystem, or query cloud instance metadata endpoints (e.g. `169.254.169.254`).

**Mitigation implemented:** every render invocation sets `PLANTUML_SECURITY_PROFILE=SANDBOX` in
the child process's environment — PlantUML's own official mechanism for restricting exactly this
class of directive. This is set unconditionally and is not configurable by the client.

**Known limitation:** this is a PlantUML-level control, not a kernel-level one. It relies on
PlantUML correctly enforcing its own sandbox profile across every diagram type and preprocessor
feature, which is a reasonable but not absolute guarantee for arbitrary/malicious input. Defense
in depth for a production deployment should also include:

- Running this service with **no route to sensitive internal services** (network policy /
  firewall rules), so even a successful SSRF-style request from inside the container has nowhere
  useful to reach.
- Blocking cloud instance metadata endpoints at the network layer if deployed on a cloud VM.
- Not relying on this service alone as the boundary between untrusted diagram input and anything
  sensitive.

This threat model — PlantUML's sandbox profile as the first line of defense, network isolation as
the second — is the intended, documented posture for this service; complete prevention through
PlantUML configuration alone is not guaranteed.

## Project structure

```text
plantuml-renderer/
├── src/
│   ├── server.ts               # process entrypoint, graceful shutdown
│   ├── app.ts                  # Express app wiring
│   ├── logger.ts
│   ├── config.ts                # env-based config, validated at startup
│   ├── routes/render.ts
│   ├── services/
│   │   ├── plantuml.service.ts # execFile + PlantUML invocation
│   │   └── concurrency-limiter.ts
│   ├── middleware/
│   │   ├── error-handler.ts
│   │   ├── request-validation.ts
│   │   ├── request-id.ts
│   │   └── rate-limit.ts
│   └── types/render.ts         # zod schema, error codes
├── test/
├── examples/                   # sample .puml diagrams
├── Dockerfile
├── docker-compose.yml
└── ...
```

## Known limitations / assumptions

- PlantUML's own error-tolerance (see the error-model note above) means `PLANTUML_ERROR` covers
  hard process failures, not every case of "the diagram probably isn't what the user meant."
- The rate limiter and concurrency limiter are per-instance (in-memory); a multi-replica
  deployment needs a shared limiter (e.g. at a gateway) for a global limit.
- Response caching (e.g. keyed by `SHA-256(diagram + format)`) is not implemented — the service
  prioritizes correctness/security in this first version. It would be a safe, optional addition
  later since render inputs are already fully captured by that key.
- The `qs`/`body-parser` transitive dependency of Express 4 has a known moderate advisory with no
  non-breaking fix currently available (would require an Express 5 upgrade). This service only
  parses JSON bodies (no query-string parsing of untrusted structured input), so real-world
  exposure is low; noted here for transparency rather than silently ignored.
