import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordMessageOwner, lookupMessageOwner, ownerOfQuoted, shortIdOf } from "./message-owners.ts";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "owners-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("message owners", () => {
    it("remembers which agent wrote a message, per device, across reloads", () => {
        recordMessageOwner("primary", "3EB0AAA", "story-coach", dir);
        expect(lookupMessageOwner("primary", "3EB0AAA", dir)).toBe("story-coach");
        expect(lookupMessageOwner("primary", "3EB0BBB", dir)).toBeUndefined();
        expect(lookupMessageOwner("other", "3EB0AAA", dir)).toBeUndefined();
        expect(fs.existsSync(path.join(dir, "primary", "message-owners.json"))).toBe(true);
    });

    it("keeps only the most recent entries", () => {
        for (let i = 0; i < 600; i++) recordMessageOwner("primary", `id${i}`, "a", dir);
        expect(lookupMessageOwner("primary", "id0", dir)).toBeUndefined();
        expect(lookupMessageOwner("primary", "id599", dir)).toBe("a");
    });

    it("survives a corrupt file", () => {
        fs.mkdirSync(path.join(dir, "primary"), { recursive: true });
        fs.writeFileSync(path.join(dir, "primary", "message-owners.json"), "{not json");
        expect(lookupMessageOwner("primary", "x", dir)).toBeUndefined();
        recordMessageOwner("primary", "x", "a", dir);
        expect(lookupMessageOwner("primary", "x", dir)).toBe("a");
    });

    it("finds the owner of the message a reply points at (quotedStanzaID)", () => {
        recordMessageOwner("primary", "3EB0618DA0386FD43C9556", "story-coach", dir);
        expect(ownerOfQuoted("primary", { quotedStanzaID: "3EB0618DA0386FD43C9556" }, dir)).toBe("story-coach");
        expect(ownerOfQuoted("primary", {}, dir)).toBeUndefined();
        expect(ownerOfQuoted("primary", undefined, dir)).toBeUndefined();
    });
});

describe("shortIdOf", () => {
    it("reads the short id of a sent message", () => {
        expect(shortIdOf({ id: { fromMe: true, remote: "c", id: "3EB0ABC", _serialized: "true_c_3EB0ABC" } })).toBe("3EB0ABC");
    });

    it("falls back to parsing a serialized id and handles junk", () => {
        expect(shortIdOf({ id: { _serialized: "true_189683@lid_3EB0ABC_out" } })).toBe("3EB0ABC");
        expect(shortIdOf(undefined)).toBeUndefined();
        expect(shortIdOf({})).toBeUndefined();
    });
});
