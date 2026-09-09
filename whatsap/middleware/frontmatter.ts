// Shared frontmatter parsing for SKILL.md and agent.md files.
//
// Not using fileText.split('---') here (the pattern skill-middleware.ts used
// before this module existed): split('---') splits on every '---' in the
// file, not just the two frontmatter delimiters, so a body that happens to
// contain a bare '---' line (a markdown horizontal rule, say) would silently
// truncate everything after it. This regex only matches the leading
// ---\n...\n--- block, leaving the rest of the content untouched regardless
// of what it contains.
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

// Extracts a single-line "field: value" from a metadata block. Strips a
// single matching pair of wrapping quotes (single or double) if present —
// this isn't a real YAML parser, but hand-edited files (e.g. scheduled task
// files under tasks/, see lib/tasks.ts) naturally get YAML-style quoting
// around values like cron expressions ("* * * * *"), and without this the
// literal quote characters would flow through into consumers like
// cron-parser and fail there instead.
export function parseMetadataField(metadata: string, field: string): string | undefined {
    const line = metadata.split('\n').find((l) => l.trim().startsWith(`${field}:`));
    if (line === undefined) return undefined;
    const raw = line.trim().slice(field.length + 1).trim();
    const quoted = raw.match(/^"([^"]*)"$|^'([^']*)'$/);
    return quoted ? (quoted[1] ?? quoted[2]) : raw;
}

// Parses "field: a, b, c" into ['a', 'b', 'c']. A missing field returns
// undefined (meaning "no restriction" to callers that use this for
// allow-lists); a present-but-empty field ("field:" with nothing after it)
// returns [] (meaning "explicitly none").
export function parseMetadataListField(metadata: string, field: string): string[] | undefined {
    const value = parseMetadataField(metadata, field);
    if (value === undefined) return undefined;
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}
