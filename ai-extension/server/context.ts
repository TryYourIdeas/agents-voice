export interface PageContext {
    type: "selection" | "page";
    text: string;
    url: string;
}

const LABELS: Record<PageContext["type"], string> = {
    selection: "Selected text from",
    page: "Full page text from",
};

// Formats attached page/selection context into a block prepended to the
// user's message. Returns undefined when there's no context to attach.
// Text longer than maxChars is clipped with an explicit note rather than
// silently dropped, per the design spec.
export function formatContext(context: PageContext | undefined, maxChars: number): string | undefined {
    if (!context) return undefined;

    const truncated = context.text.length > maxChars;
    const text = truncated ? context.text.slice(0, maxChars) : context.text;
    const note = truncated ? `\n[truncated: showing first ${maxChars} of ${context.text.length} characters]` : "";

    return `${LABELS[context.type]} ${context.url}:\n"""\n${text}\n"""${note}`;
}
