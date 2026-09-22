import { describe, it, expect } from "vitest";
import { parseFrontmatter, parseMetadataField } from "./frontmatter.ts";

describe("parseFrontmatter", () => {
    it("splits metadata and content", () => {
        const { metadata, content } = parseFrontmatter("---\nname: foo\ndescription: bar\n---\nBody text\n");
        expect(metadata).toBe("name: foo\ndescription: bar");
        expect(content).toBe("Body text\n");
    });

    it("throws when there is no leading frontmatter block", () => {
        expect(() => parseFrontmatter("no frontmatter here")).toThrow(/Invalid frontmatter/);
    });
});

describe("parseMetadataField", () => {
    it("extracts a plain field", () => {
        expect(parseMetadataField("name: foo\ndescription: bar", "name")).toBe("foo");
    });

    it("strips wrapping quotes", () => {
        expect(parseMetadataField('name: "quoted value"', "name")).toBe("quoted value");
    });

    it("returns undefined for a missing field", () => {
        expect(parseMetadataField("name: foo", "description")).toBeUndefined();
    });
});
