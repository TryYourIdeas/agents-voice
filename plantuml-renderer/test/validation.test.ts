import { describe, expect, it } from "vitest";
import request from "supertest";
import { mockExecFile } from "./mock-exec-file.js";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

const app = createApp();

describe("request validation", () => {
  it("rejects a non-string diagram with 400 INVALID_REQUEST", async () => {
    const res = await request(app).post("/render").send({ diagram: 12345, format: "svg" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });

  it("rejects a diagram over the configured max size with 400 DIAGRAM_TOO_LARGE", async () => {
    const oversized = "a".repeat(config.maxDiagramSize + 1);
    const res = await request(app).post("/render").send({ diagram: oversized, format: "svg" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("DIAGRAM_TOO_LARGE");
  });

  it("rejects a request body that exceeds the raw body size limit", async () => {
    const huge = "a".repeat(config.maxDiagramSize * 3);
    const res = await request(app).post("/render").send({ diagram: huge, format: "svg" });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("DIAGRAM_TOO_LARGE");
  });

  it("accepts a valid request and normalizes the missing format field to svg", async () => {
    mockExecFile("svg");
    const res = await request(app).post("/render").send({ diagram: "@startuml\nA -> B\n@enduml" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
  });

  it("echoes a valid client-supplied X-Request-ID", async () => {
    const res = await request(app)
      .post("/render")
      .set("X-Request-ID", "test-request-123")
      .send({ diagram: "", format: "svg" });
    expect(res.headers["x-request-id"]).toBe("test-request-123");
    expect(res.body.requestId).toBe("test-request-123");
  });

  it("generates a request ID when the client doesn't supply one", async () => {
    const res = await request(app).post("/render").send({ diagram: "", format: "svg" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
