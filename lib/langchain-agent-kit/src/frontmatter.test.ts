import { describe, it, expect } from "vitest";
import { parseFrontmatter, parseMetadataField, parseMetadataListField } from "./frontmatter.ts";

describe("parseFrontmatter", () => {
    it("splits a leading --- delimited block from the body", () => {
        const { metadata, content } = parseFrontmatter("---\nname: foo\n---\nBody text.");
        expect(metadata).toBe("name: foo");
        expect(content).toBe("Body text.");
    });

    it("leaves a bare --- inside the body untouched (doesn't split on every occurrence)", () => {
        const { metadata, content } = parseFrontmatter("---\nname: foo\n---\nBefore\n---\nAfter");
        expect(metadata).toBe("name: foo");
        expect(content).toBe("Before\n---\nAfter");
    });

    it("throws for text with no frontmatter block", () => {
        expect(() => parseFrontmatter("no frontmatter here")).toThrow(/Invalid frontmatter/);
    });
});

describe("parseMetadataField", () => {
    it("extracts a plain, unquoted single-line value", () => {
        expect(parseMetadataField("description: System design interview coach.", "description")).toBe(
            "System design interview coach."
        );
    });

    it("strips a matching pair of double quotes", () => {
        expect(parseMetadataField('schedule: "* * * * *"', "schedule")).toBe("* * * * *");
    });

    it("strips a matching pair of single quotes", () => {
        expect(parseMetadataField("schedule: '0 9 * * MON'", "schedule")).toBe("0 9 * * MON");
    });

    it("does not strip quotes that don't wrap the whole value", () => {
        expect(parseMetadataField('description: says "hello" to you', "description")).toBe('says "hello" to you');
    });

    it("returns undefined for a field that isn't present", () => {
        expect(parseMetadataField("name: foo", "description")).toBeUndefined();
    });
});

describe("parseMetadataListField", () => {
    it("splits a comma-separated field into trimmed items", () => {
        expect(parseMetadataListField("allowed-tools: my_read_file, list_directory", "allowed-tools")).toEqual([
            "my_read_file",
            "list_directory",
        ]);
    });

    it("returns undefined (no restriction) when the field is absent", () => {
        expect(parseMetadataListField("name: foo", "allowed-tools")).toBeUndefined();
    });

    it("returns an empty array (explicitly none) when the field is present but empty", () => {
        expect(parseMetadataListField("allowed-tools:\nname: foo", "allowed-tools")).toEqual([]);
    });
});
