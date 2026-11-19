import { describe, it, expect } from "vitest";
import { toolErrorMiddleware } from "./tool-error-middleware.ts";

const call = (handler: () => Promise<any>) =>
  (toolErrorMiddleware as any).wrapToolCall({ toolCall: { name: "execute_bash", args: {}, id: "c1" } }, handler);

describe("toolErrorMiddleware", () => {
  it("passes successful results through", async () => {
    expect(await call(async () => "ok")).toBe("ok");
  });
  it("converts a thrown tool error into an error ToolMessage", async () => {
    const r: any = await call(async () => { throw new Error("/bin/sh: 1: file: not found"); });
    expect(r.status).toBe("error");
    expect(r.tool_call_id).toBe("c1");
    expect(r.content).toContain("execute_bash failed");
    expect(r.content).toContain("file: not found");
  });
  it("handles non-Error rejections (execute_bash rejects with a string)", async () => {
    const r: any = await call(async () => { throw "boom"; });
    expect(r.content).toContain("boom");
  });
  it("re-throws LangGraph control-flow errors", async () => {
    await expect(call(async () => { throw Object.assign(new Error("interrupt"), { is_bubble_up: true }); })).rejects.toThrow("interrupt");
  });
});
