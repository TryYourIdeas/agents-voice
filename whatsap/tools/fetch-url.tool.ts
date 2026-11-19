import { tool } from "langchain";
import { z } from "zod";
import { htmlToText } from "../lib/html-to-text.ts";

// Cap response size so a huge page/response body doesn't blow up the
// agent's context window.
const MAX_CONTENT_LENGTH = 50_000;

export const fetchUrlTool = tool(
  async ({ url }: { url: string }) => {
    console.log("Fetching URL:", url);

    // Failures are returned as text, not thrown: a thrown tool error aborted the whole agent turn
    // ("Sorry, something went wrong"), e.g. when the model guessed a domain that does not resolve
    // (EAI_AGAIN) or a site answered 403. Returned, the model can read the error and try another URL.
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e: any) {
      const cause = e?.cause?.code || e?.cause?.message || e?.name;
      return `Error: could not fetch ${url} (${e?.message ?? e}${cause ? `: ${cause}` : ""}). The address may be wrong or unreachable; do not retry it, try a different source.`;
    }

    if (!response.ok) {
      return `Error: failed to fetch ${url}: ${response.status} ${response.statusText}. Try a different source.`;
    }

    const contentType = response.headers.get("content-type") || "unknown";
    const body = await response.text();
    // HTML is reduced to readable text first: raw markup filled the cap with
    // <head>/scripts and left no headlines for the model to read.
    const isHtml = /html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(body);
    const text = isHtml ? htmlToText(body) : body;
    const truncated = text.length > MAX_CONTENT_LENGTH;
    const content = truncated ? text.slice(0, MAX_CONTENT_LENGTH) : text;

    return `Content-Type: ${contentType}${isHtml ? " (converted to text)" : ""}${truncated ? ` (truncated to ${MAX_CONTENT_LENGTH} characters)` : ""}\n\n${content}`;
  },
  {
    name: "fetch_url",
    description: "Fetch the content of a URL over HTTP(S) and return it as text. Use this to read the content of a web page, API response, or other URL-accessible resource.",
    schema: z.object({
      url: z.string().url().describe("The URL to fetch"),
    }),
  }
);
