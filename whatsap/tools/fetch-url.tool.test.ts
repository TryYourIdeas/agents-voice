import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchUrlTool } from "./fetch-url.tool.ts";
import * as pdf from "../lib/pdf-to-text.ts";

vi.mock("../lib/pdf-to-text.ts", () => ({ pdfToText: vi.fn() }));

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

  it("converts PDFs to text instead of returning raw bytes", async () => {
    vi.mocked(pdf.pdfToText).mockResolvedValue("NM40 impeller part 12");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF-1.7 bytes", { headers: { "content-type": "application/pdf" } })));
    const r = await fetchUrlTool.invoke({ url: "https://example.com/cat.pdf" });
    expect(r).toContain("PDF converted to text");
    expect(r).toContain("NM40 impeller part 12");
    expect(r).not.toContain("%PDF");
  });

  it("returns an error when PDF extraction fails or finds no text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } })));
    vi.mocked(pdf.pdfToText).mockRejectedValueOnce(new Error("pdftotext (poppler-utils) is not installed"));
    expect(await fetchUrlTool.invoke({ url: "https://example.com/a.pdf" })).toContain("not installed");
    vi.mocked(pdf.pdfToText).mockResolvedValueOnce("  \n");
    expect(await fetchUrlTool.invoke({ url: "https://example.com/a.pdf" })).toContain("no extractable text");
  });

  it("pages long documents with offset", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("a".repeat(50_000) + "TAIL", { headers: { "content-type": "text/plain" } })));
    const first = await fetchUrlTool.invoke({ url: "https://example.com/long" });
    expect(first).toContain("offset=50000");
    const second = await fetchUrlTool.invoke({ url: "https://example.com/long", offset: 50_000 });
    expect(second).toContain("TAIL");
    expect(second).not.toContain("offset=");
  });

  it("returns (does not throw) when reading the body times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, headers: new Headers({ "content-type": "text/html" }),
      text: async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); },
    })));
    expect(await fetchUrlTool.invoke({ url: "https://example.com/slow" })).toContain("TimeoutError");
  });

  it("find returns only the matching sections of a long document", async () => {
    const doc = "x".repeat(200_000) + " Model NM40 flow 12 m3/h " + "y".repeat(100_000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(doc, { headers: { "content-type": "text/plain" } })));
    const r = await fetchUrlTool.invoke({ url: "https://example.com/doc", find: "nm40|zzz" });
    expect(r).toContain("1 matching section(s)");
    expect(r).toContain("Model NM40 flow");
    expect(r.length).toBeLessThan(2000);
    expect(await fetchUrlTool.invoke({ url: "https://example.com/doc", find: "absent" })).toContain("No match");
  });

  it("find tolerates catalogue spellings of a model number", async () => {
    const doc = "intro. Bomba NM 40/12 A flow. Also nm-50 pump. And NM4 only." + "z".repeat(5000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(doc, { headers: { "content-type": "text/plain" } })));
    const r = await fetchUrlTool.invoke({ url: "https://example.com/spell", find: "NM40|NM50" });
    expect(r).toContain("NM 40/12 A");
    expect(r).toContain("nm-50");
  });
});
