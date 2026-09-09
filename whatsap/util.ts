export function extractText(content: string | Array<{ type: string; text?: string }>): string {
    if (typeof content === "string") {
        return content;
    }

    // ChatAnthropic can return an array of content blocks (e.g. thinking + text)
    // instead of a plain string; only the text blocks are meant for the user.
    return content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}
