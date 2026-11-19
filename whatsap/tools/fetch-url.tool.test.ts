import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchUrlTool } from "./fetch-url.tool.ts";

afterEach(() => vi.unstubAllGlobals());

describe("fetch_url", () => {
  it("returns the page text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hello", { headers: { "content-type": "text/plain" } })));
    expect(await fetchUrlTool.invoke({ url: "https://example.com/a" })).toContain("hello");
  });

  it("returns (does not throw) on a DNS/network failure", async () => {
    const err: any = new TypeError("fetch failed");
    err.cause = Object.assign(new Error("getaddrinfo EAI_AGAIN x"), { code: "EAI_AGAIN" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw err; }));
    const r = await fetchUrlTool.invoke({ url: "https://nope.invalid/x" });
    expect(r).toContain("Error: could not fetch https://nope.invalid/x");
    expect(r).toContain("EAI_AGAIN");
  });

  it("returns (does not throw) on an HTTP error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403, statusText: "Forbidden" })));
    expect(await fetchUrlTool.invoke({ url: "https://example.com/b" })).toContain("403 Forbidden");
  });
});
