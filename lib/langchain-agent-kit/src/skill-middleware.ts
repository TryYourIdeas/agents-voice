import { createMiddleware, tool } from "langchain";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, parseMetadataField } from "./frontmatter.ts";

export interface Skill {
    name: string;
    description: string;
    content: string;
}

// Loads skills (subdirectories containing a SKILL.md) from one directory.
// Returns [] for a directory that doesn't exist, since per-agent skills
// directories (agents/<name>/skills) are optional — most agents won't have
// one.
function getSkillsFiles(directoryPath: string): Skill[] {
    if (!directoryPath) {
        throw new Error("Directory path cannot be empty");
    }

    if (!fs.existsSync(directoryPath)) {
        return [];
    }

    const stat = fs.statSync(directoryPath);
    if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`);
    }

    const entries = fs.readdirSync(directoryPath);

    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry);
        const entryStat = fs.statSync(fullPath);
        if (entryStat.isDirectory()) {
            files.push(fullPath + "/SKILL.md");
        }
    }

    return files
        .filter((filePath) => fs.existsSync(filePath))
        .map((filePath) => {
            const fileText = fs.readFileSync(filePath, "utf-8");
            const { metadata, content } = parseFrontmatter(fileText);
            const name = parseMetadataField(metadata, "name");
            const description = parseMetadataField(metadata, "description");
            if (!name || !description) {
                throw new Error(`Invalid skill metadata in ${filePath}: missing name or description`);
            }
            return { name, description, content };
        });
}

// Loads skills from skillsDir (the global set every agent gets) plus any
// extra directories given — used to layer an agent-specific skills
// directory (e.g. agents/<name>/skills) on top of the global ones.
export function loadSkills(skillsDir: string, extraDirs: string[] = []): Skill[] {
    return [getSkillsFiles(skillsDir), ...extraDirs.map(getSkillsFiles)].flat();
}

function buildSkillMiddleware(skills: Skill[]) {
    const loadSkill = tool(
        async ({ skillName }) => {
            const skill = skills.find((s) => s.name === skillName);
            if (skill) {
                return `Loaded skill: ${skillName}\n\n${skill.content}`;
            }

            const available = skills.map((s) => s.name).join(", ");
            return `Skill '${skillName}' not found. Available skills: ${available}`;
        },
        {
            name: "load_skill",
            description: `Load the full content of a skill into the agent's context.

Use this when you need detailed information about how to handle a specific
type of request. This will provide you with comprehensive instructions,
policies, and guidelines for the skill area.`,
            schema: z.object({
                skillName: z.string().describe("The name of the skill to load"),
            }),
        }
    );

    const skillsPrompt = skills.map(
        (skill: Skill) => `- **${skill.name}**: ${skill.description}`
    ).join("\n");

    return createMiddleware({
        name: "skillMiddleware",
        tools: [loadSkill],
        wrapModelCall: async (request, handler) => {
            const skillsAddendum =
                `\n\n## Available Skills\n\n${skillsPrompt}\n\n` +
                "Use the load_skill tool when you need detailed information " +
                "about handling a specific type of request.";

            // request.systemMessage is a SystemMessage instance, not a
            // string (`+` would coerce it to "[object Object]"), and the
            // field the model call actually reads back is `systemMessage`,
            // not `systemPrompt` — writing the latter would silently
            // discard this addendum and let an unrelated raw `systemPrompt`
            // field win, replacing the agent's real system prompt instead
            // of extending it.
            return handler({
                ...request,
                systemMessage: request.systemMessage.concat(skillsAddendum),
            });
        },
    });
}

// Builds a skill middleware scoped to skillsDir plus any extra directories
// (e.g. an agent-specific agents/<name>/skills). Each call re-scans disk, so
// callers should build once per agent and reuse.
//
// opts.allowedSkills, when given, restricts the result to only those skill
// names (an agent.md's allowed-skills field) — e.g. so a coaching agent
// doesn't also see unrelated global dev skills like git-tasks. Omit it for
// no restriction (every discovered skill, the historical default).
export function createSkillMiddleware(
    skillsDir: string = "./skills",
    opts?: { extraDirs?: string[]; allowedSkills?: string[] }
) {
    let skills = loadSkills(skillsDir, opts?.extraDirs ?? []);
    if (opts?.allowedSkills) {
        skills = skills.filter((s) => opts.allowedSkills!.includes(s.name));
    }
    return buildSkillMiddleware(skills);
}
