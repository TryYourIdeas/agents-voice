import { tool } from "langchain";
import { z } from "zod";

// Cap response size so a huge page/response body doesn't blow up the
// agent's context window.
const MAX_CONTENT_LENGTH = 50_000;

export const fetchUrlTool = tool(
  async ({ url }: { url: string }) => {
    console.log("Fetching URL:", url);

    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "unknown";
    const text = await response.text();
    const truncated = text.length > MAX_CONTENT_LENGTH;
    const content = truncated ? text.slice(0, MAX_CONTENT_LENGTH) : text;

    return `Content-Type: ${contentType}${truncated ? ` (truncated to ${MAX_CONTENT_LENGTH} characters)` : ""}\n\n${content}`;
  },
  {
    name: "fetch_url",
    description: "Fetch the content of a URL over HTTP(S) and return it as text. Use this to read the content of a web page, API response, or other URL-accessible resource.",
    schema: z.object({
      url: z.string().url().describe("The URL to fetch"),
    }),
  }
);
