import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadSkills, createSkillMiddleware } from "./skill-middleware.ts";

let cwd: string;
let originalCwd: string;

beforeEach(async () => {
    originalCwd = process.cwd();
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "langchain-agent-kit-skills-"));
    process.chdir(cwd);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(cwd, { recursive: true, force: true });
});

describe("loadSkills", () => {
    it("returns [] when the skills dir doesn't exist", () => {
        expect(loadSkills("./skills")).toEqual([]);
    });

    it("loads a skill from a SKILL.md with valid frontmatter", async () => {
        await fs.mkdir("skills/example", { recursive: true });
        await fs.writeFile(
            "skills/example/SKILL.md",
            "---\nname: example\ndescription: An example skill\n---\nSkill body text\n"
        );
        const skills = loadSkills("./skills");
        expect(skills).toEqual([{ name: "example", description: "An example skill", content: "Skill body text\n" }]);
    });

    it("throws when a SKILL.md is missing name or description", async () => {
        await fs.mkdir("skills/broken", { recursive: true });
        await fs.writeFile("skills/broken/SKILL.md", "---\nname: broken\n---\nBody\n");
        expect(() => loadSkills("./skills")).toThrow(/missing name or description/);
    });

    it("layers extraDirs on top of the base skills dir", async () => {
        await fs.mkdir("skills/global", { recursive: true });
        await fs.writeFile(
            "skills/global/SKILL.md",
            "---\nname: global\ndescription: A global skill\n---\nGlobal body\n"
        );
        await fs.mkdir("agent-skills/only-mine", { recursive: true });
        await fs.writeFile(
            "agent-skills/only-mine/SKILL.md",
            "---\nname: only-mine\ndescription: An agent-specific skill\n---\nMine\n"
        );
        const skills = loadSkills("./skills", ["./agent-skills"]);
        expect(skills.map((s) => s.name).sort()).toEqual(["global", "only-mine"]);
    });
});

describe("createSkillMiddleware", () => {
    it("lists every discovered skill in the system prompt addendum", async () => {
        await fs.mkdir("skills/example", { recursive: true });
        await fs.writeFile(
            "skills/example/SKILL.md",
            "---\nname: example\ndescription: An example skill\n---\nBody\n"
        );
        const middleware = createSkillMiddleware("./skills");
        const loadSkillTool = middleware.tools?.find((t) => t.name === "load_skill");
        expect(loadSkillTool).toBeDefined();

        const result = await loadSkillTool!.invoke({ skillName: "example" });
        expect(result).toContain("Body");
    });

    it("restricts to allowedSkills when given", async () => {
        await fs.mkdir("skills/allowed", { recursive: true });
        await fs.writeFile("skills/allowed/SKILL.md", "---\nname: allowed\ndescription: Allowed\n---\nA\n");
        await fs.mkdir("skills/blocked", { recursive: true });
        await fs.writeFile("skills/blocked/SKILL.md", "---\nname: blocked\ndescription: Blocked\n---\nB\n");

        const middleware = createSkillMiddleware("./skills", { allowedSkills: ["allowed"] });
        const loadSkillTool = middleware.tools?.find((t) => t.name === "load_skill");

        const allowedResult = await loadSkillTool!.invoke({ skillName: "allowed" });
        expect(allowedResult).toContain("A");

        const blockedResult = await loadSkillTool!.invoke({ skillName: "blocked" });
        expect(blockedResult).toContain("not found");
    });
});
