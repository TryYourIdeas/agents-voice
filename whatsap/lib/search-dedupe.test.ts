import { describe, it, expect, beforeEach } from "vitest";
import { recordSearch, duplicateSearchMessage, resetSearchDedupe } from "./search-dedupe.ts";

beforeEach(() => resetSearchDedupe());

describe("recordSearch", () => {
    it("lets a first query through and flags the repeat", () => {
        expect(recordSearch("t1", "AI news", "news")).toBeUndefined();
        expect(recordSearch("t1", "AI news", "news")).toBe(1);
        expect(recordSearch("t1", "AI news", "news")).toBe(2);
    });
    it("ignores case and whitespace differences", () => {
        recordSearch("t1", "AI  news");
        expect(recordSearch("t1", " ai news ")).toBe(1);
    });
    it("treats a different topic or thread as a fresh query", () => {
        recordSearch("t1", "AI news", "news");
        expect(recordSearch("t1", "AI news", "general")).toBeUndefined();
        expect(recordSearch("t2", "AI news", "news")).toBeUndefined();
    });
});

describe("duplicateSearchMessage", () => {
    it("tells the agent to stop repeating", () => {
        expect(duplicateSearchMessage("x", 3)).toMatch(/already ran.*3 times.*answer/s);
    });
});
