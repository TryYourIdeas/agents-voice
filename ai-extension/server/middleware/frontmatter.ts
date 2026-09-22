// Same parsing rules as whatsap/middleware/frontmatter.ts — kept as this
// project's own copy per the design spec's "independent copy" decision.
export interface ParsedFrontmatter {
    metadata: string;
    content: string;
}

export function parseFrontmatter(fileText: string): ParsedFrontmatter {
    const match = fileText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        throw new Error("Invalid frontmatter format: expected a leading '---' delimited block");
    }
    return { metadata: match[1], content: match[2] };
}

export function parseMetadataField(metadata: string, field: string): string | undefined {
    const line = metadata.split("\n").find((l) => l.trim().startsWith(`${field}:`));
    if (line === undefined) return undefined;
    const raw = line.trim().slice(field.length + 1).trim();
    const quoted = raw.match(/^"([^"]*)"$|^'([^']*)'$/);
    return quoted ? (quoted[1] ?? quoted[2]) : raw;
}
