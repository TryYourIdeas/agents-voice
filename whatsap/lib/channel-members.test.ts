import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSaveMembersCommand, channelDirName, renderMembersMarkdown, saveChannelMembers } from "./channel-members.ts";

describe("parseSaveMembersCommand", () => {
    it("extracts a channel name containing spaces", () => {
        expect(parseSaveMembersCommand("save Family Group members")).toBe("Family Group");
    });
    it("is case-insensitive on keywords", () => {
        expect(parseSaveMembersCommand("SAVE Team MEMBERS")).toBe("Team");
    });
    it("keeps a trailing 'members' that belongs to the name", () => {
        expect(parseSaveMembersCommand("save Team members members")).toBe("Team members");
    });
    it("returns undefined when name or suffix is missing", () => {
        expect(parseSaveMembersCommand("save members")).toBeUndefined();
        expect(parseSaveMembersCommand("save Family")).toBeUndefined();
    });
});

describe("channelDirName", () => {
    it("hyphenates spaces and lowercases", () => {
        expect(channelDirName("Family Group")).toBe("family-group");
    });
    it("neutralises path separators and dots", () => {
        expect(channelDirName("../../etc/passwd")).toBe("etc-passwd");
    });
    it("keeps unicode letters and falls back when empty", () => {
        expect(channelDirName("Fámília!")).toBe("fámília");
        expect(channelDirName("***")).toBe("channel");
    });
});

describe("renderMembersMarkdown / saveChannelMembers", () => {
    const members = [
        { name: "Ana", phone: "5548999", isAdmin: true },
        { phone: "5511888", isAdmin: false },
    ];
    it("renders name, phone and admin marker", () => {
        const md = renderMembersMarkdown("Family Group", members, new Date("2026-11-05T00:00:00Z"));
        expect(md).toContain("# Family Group — members");
        expect(md).toContain("Members: 2");
        expect(md).toContain("- Ana (+5548999) — admin");
        expect(md).toContain("- (+5511888)");
    });
    it("writes under devices/<device>/channels/<dir>/members.md and overwrites", () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), "members-"));
        const file = saveChannelMembers("primary", "Family Group", members, new Date(), base);
        expect(file).toBe(path.join(base, "primary", "channels", "family-group", "members.md"));
        saveChannelMembers("primary", "Family Group", [members[0]], new Date(), base);
        expect(fs.readFileSync(file, "utf-8")).toContain("Members: 1");
    });
});
