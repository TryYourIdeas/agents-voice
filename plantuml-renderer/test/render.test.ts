import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mockExecFile } from "./mock-exec-file.js";
import { createApp } from "../src/app.js";

const app = createApp();
const validDiagram = "@startuml\nAlice -> Bob: Hello\nBob --> Alice: Hi!\n@enduml";

describe("POST /render", () => {
  beforeEach(() => {
    mockExecFile("svg");
  });

  it("renders SVG and returns image/svg+xml", async () => {
    mockExecFile("svg");
    const res = await request(app).post("/render").send({ diagram: validDiagram, format: "svg" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(Buffer.from(res.body).toString("utf-8")).toContain("<svg");
  });

  it("renders PNG and returns image/png", async () => {
    mockExecFile("png");
    const res = await request(app)
      .post("/render")
      .send({ diagram: validDiagram, format: "png" })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it("defaults format to svg when omitted", async () => {
    mockExecFile("svg");
    const res = await request(app).post("/render").send({ diagram: validDiagram });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
  });

  it("rejects an unsupported format with 400 INVALID_FORMAT", async () => {
    const res = await request(app).post("/render").send({ diagram: validDiagram, format: "jpg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_FORMAT");
    expect(res.body.requestId).toBeTruthy();
  });

  it("rejects a missing diagram with 400", async () => {
    const res = await request(app).post("/render").send({ format: "svg" });
    expect(res.status).toBe(400);
  });

  it("rejects an empty diagram with 400", async () => {
    const res = await request(app).post("/render").send({ diagram: "", format: "svg" });
    expect(res.status).toBe(400);
  });

  it("returns 400 PLANTUML_ERROR when PlantUML fails to render", async () => {
    mockExecFile("error");
    const res = await request(app).post("/render").send({ diagram: "not a real diagram", format: "svg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PLANTUML_ERROR");
    // Never leak process stderr / stack traces to the client.
    expect(JSON.stringify(res.body)).not.toContain("syntax error");
  });

  it("returns 400 PLANTUML_ERROR when the renderer produces no output", async () => {
    mockExecFile("empty");
    const res = await request(app).post("/render").send({ diagram: validDiagram, format: "svg" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PLANTUML_ERROR");
  });

  it("returns 504 RENDER_TIMEOUT and does not hang when rendering exceeds the timeout", async () => {
    mockExecFile("timeout");
    const res = await request(app).post("/render").send({ diagram: validDiagram, format: "svg" });

    expect(res.status).toBe(504);
    expect(res.body.error).toBe("RENDER_TIMEOUT");
  });
});
