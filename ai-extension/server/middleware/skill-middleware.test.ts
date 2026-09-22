import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadSkills } from "./skill-middleware.ts";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ai-extension-skills-"));
    process.chdir(cwd);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(cwd, { recursive: true, force: true });
});

describe("loadSkills", () => {
    it("returns [] when ./skills doesn't exist", () => {
        expect(loadSkills()).toEqual([]);
    });

    it("loads a skill from a SKILL.md with valid frontmatter", async () => {
        await fs.mkdir("skills/example", { recursive: true });
        await fs.writeFile(
            "skills/example/SKILL.md",
            "---\nname: example\ndescription: An example skill\n---\nSkill body text\n"
        );
        const skills = loadSkills();
        expect(skills).toEqual([{ name: "example", description: "An example skill", content: "Skill body text\n" }]);
    });

    it("throws when a SKILL.md is missing name or description", async () => {
        await fs.mkdir("skills/broken", { recursive: true });
        await fs.writeFile("skills/broken/SKILL.md", "---\nname: broken\n---\nBody\n");
        expect(() => loadSkills()).toThrow(/missing name or description/);
    });
});
