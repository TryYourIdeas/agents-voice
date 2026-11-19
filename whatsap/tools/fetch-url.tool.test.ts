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
});
