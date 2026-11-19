import { describe, it, expect } from "vitest";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { urlSeenInMessages, normalizeUrl, fetchUrlGuardMiddleware } from "./fetch-url-guard-middleware.ts";

const searchResult = new ToolMessage({ tool_call_id: "1", content: '{"results":[{"url":"https://tfpumps.com/product/calpeda-nm50/","title":"x"}]}' });

describe("urlSeenInMessages", () => {
  it("accepts URLs from the user and from tool results (ignoring fragment, case, trailing slash)", () => {
    const msgs = [new HumanMessage("read https://Example.com/a/b#top."), searchResult];
    expect(urlSeenInMessages("https://example.com/a/b", msgs)).toBe(true);
    expect(urlSeenInMessages("https://tfpumps.com/product/calpeda-nm50", msgs)).toBe(true);
  });
  it("rejects URLs only the model wrote or never appeared", () => {
    const msgs = [new HumanMessage("research pump"), new AIMessage("try https://naftasolutions.com/pump-info"), searchResult];
    expect(urlSeenInMessages("https://naftasolutions.com/pump-info", msgs)).toBe(false);
    expect(urlSeenInMessages("https://tfpumps.com/other", msgs)).toBe(false);
  });
  it("normalizes", () => expect(normalizeUrl("HTTPS://A.com/x/#f")).toBe("https://a.com/x"));
});

describe("fetchUrlGuardMiddleware", () => {
  const run = async (url: string, messages: any[], name = "fetch_url") => {
    let called = false;
    const res: any = await (fetchUrlGuardMiddleware as any).wrapToolCall(
      { toolCall: { name, args: { url }, id: "c1" }, state: { messages } },
      async () => { called = true; return "real" },
    );
    return { res, called };
  };
  it("blocks an unseen URL with an error ToolMessage", async () => {
    const { res, called } = await run("https://naftasolutions.com/pump-info", [new HumanMessage("research pump")]);
    expect(called).toBe(false);
    expect(res.status).toBe("error");
    expect(res.content).toContain("Do not guess URLs");
  });
  it("passes a seen URL and other tools through", async () => {
    expect((await run("https://tfpumps.com/product/calpeda-nm50", [searchResult])).called).toBe(true);
    expect((await run("https://never.seen/x", [], "web_search")).called).toBe(true);
  });
  it("can be disabled", async () => {
    process.env.FETCH_URL_GUARD = "false";
    expect((await run("https://never.seen/x", [])).called).toBe(true);
    delete process.env.FETCH_URL_GUARD;
  });
});
