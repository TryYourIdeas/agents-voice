// lib/html-to-text.ts
//
// Reduces an HTML page to the text a model can read. fetch_url used to return
// the raw markup, which for a modern news site is mostly <head>, scripts and
// attributes: the first 50k characters held no headlines, so a small model kept
// guessing other URLs until it ran out of steps. Deliberately dependency-free
// and approximate — it only has to surface headings, text and link targets.

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

function decodeEntities(s: string): string {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e: string) => {
        if (e[0] === "#") {
            const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return NAMED_ENTITIES[e.toLowerCase()] ?? match;
    });
}

export function htmlToText(html: string): string {
    if (!/<[a-z!/]/i.test(html)) return html.trim();

    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

    let s = html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, "")
        .replace(/<a\b[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
            const label = inner.replace(/<[^>]+>/g, "").trim();
            return label && !href.startsWith("#") && !href.toLowerCase().startsWith("javascript:") ? `${label} (${href})` : label;
        })
        .replace(/<h1\b[^>]*>/gi, "\n# ")
        .replace(/<h2\b[^>]*>/gi, "\n## ")
        .replace(/<h([3-6])\b[^>]*>/gi, "\n### ")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/?(p|div|section|article|header|footer|main|nav|ul|ol|table|tr|br|hr|h[1-6]|li|blockquote|figure|figcaption)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "");

    s = decodeEntities(s)
        .split("\n")
        .map((line) => line.replace(/[ \t ]+/g, " ").trim())
        .filter(Boolean)
        .join("\n");

    const t = title ? decodeEntities(title).replace(/\s+/g, " ").trim() : "";
    return t ? `Title: ${t}\n${s}` : s;
}
