import { tool } from "langchain";
import { z } from "zod";
import { htmlToText } from "../lib/html-to-text.ts";
import { pdfToText } from "../lib/pdf-to-text.ts";

// Cap response size so a huge page/response body doesn't blow up the
// agent's context window.
const MAX_CONTENT_LENGTH = 50_000;

const FIND_WINDOW = 400; // characters of context on each side of a match
const FIND_MAX_MATCHES = 12;

/** Snippets around every (case-insensitive) occurrence of any term, merged when they overlap. */
export function findInText(text: string, find: string): string {
  const terms = find.split(/\s*[|\n]\s*/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const lower = text.toLowerCase();
  const hits: number[] = [];
  for (const t of terms) {
    for (let i = lower.indexOf(t); i !== -1 && hits.length < 500; i = lower.indexOf(t, i + t.length)) hits.push(i);
  }
  hits.sort((a, b) => a - b);
  const windows: [number, number][] = [];
  for (const h of hits) {
    const a = Math.max(0, h - FIND_WINDOW), b = Math.min(text.length, h + FIND_WINDOW);
    const last = windows[windows.length - 1];
    if (last && a <= last[1]) last[1] = b; else windows.push([a, b]);
  }
  if (!windows.length) return `No match for ${terms.map((t) => `"${t}"`).join(", ")} in this document (${text.length} characters).`;
  const shown = windows.slice(0, FIND_MAX_MATCHES);
  return (
    `${windows.length} matching section(s) for ${terms.map((t) => `"${t}"`).join(", ")}` +
    `${windows.length > shown.length ? ` (showing the first ${shown.length})` : ""}:\n\n` +
    shown.map(([a, b]) => `[characters ${a}-${b}]\n${text.slice(a, b)}`).join("\n\n---\n\n")
  );
}

async function readUrl({ url, offset, find }: { url: string; offset?: number; find?: string }) {
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
    const isPdf = /pdf/i.test(contentType) || /\.pdf($|[?#])/i.test(url);
    let text: string;
    let isHtml = false;
    if (isPdf) {
      // PDFs are binary: convert to text (layout kept, so catalogue tables stay readable).
      try {
        text = await pdfToText(new Uint8Array(await response.arrayBuffer()));
      } catch (e: any) {
        return `Error: ${url} is a PDF and its text could not be extracted (${e?.message ?? e}). Try a different source.`;
      }
      if (!text.trim()) return `Error: ${url} is a PDF with no extractable text (probably scanned images). Try a different source.`;
    } else {
      const body = await response.text();
      // HTML is reduced to readable text first: raw markup filled the cap with
      // <head>/scripts and left no headlines for the model to read.
      isHtml = /html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(body);
      text = isHtml ? htmlToText(body) : body;
    }
    if (find && find.trim()) {
      return `Content-Type: ${contentType}${isPdf ? " (PDF converted to text)" : ""}, searched for ${JSON.stringify(find)}\n\n${findInText(text, find)}`;
    }
    const start = Math.max(0, Math.trunc(offset ?? 0));
    const total = text.length;
    const truncated = total - start > MAX_CONTENT_LENGTH;
    const content = text.slice(start, start + MAX_CONTENT_LENGTH);
    const note = truncated
      ? ` (characters ${start}-${start + content.length} of ${total}; call again with offset=${start + content.length} to read the next part)`
      : start > 0 ? ` (characters ${start}-${total} of ${total})` : "";

    return `Content-Type: ${contentType}${isHtml ? " (converted to text)" : ""}${isPdf ? " (PDF converted to text)" : ""}${note}\n\n${content}`;
}

export const fetchUrlTool = tool(
  async (args: { url: string; offset?: number; find?: string }) => {
    console.log("Fetching URL:", args.url);
    try {
      return await readUrl(args);
    } catch (e: any) {
      // e.g. the 30 s timeout firing while the body is still downloading (a slow 700 KB page),
      // which is thrown outside the initial fetch() call and used to abort the whole turn.
      return `Error: reading ${args.url} failed (${e?.name ?? "Error"}: ${e?.message ?? e}). Try a different source.`;
    }
  },
  {
    name: "fetch_url",
    description: "Fetch the content of a URL over HTTP(S) and return it as text. Use this to read the content of a web page, PDF (converted to text), API response, or other URL-accessible resource. Long documents are returned in parts; pass offset to read the next part. For a long catalogue or manual, pass find (words or part numbers, separated by |) to get just the matching sections instead of paging through it.",
    schema: z.object({
      url: z.string().url().describe("The URL to fetch"),
      offset: z.number().int().min(0).optional().describe("Character offset to start reading from, for continuing a long page or PDF (the previous result says which offset to use)"),
      find: z.string().optional().describe("Return only the sections around these terms (case-insensitive; separate several with |), e.g. \"NM40|NM 50\". Preferred for large PDFs."),
    }),
  }
);
