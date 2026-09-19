// Progressive-disclosure skill system for this agent, mirroring
// whatsap/middleware/skill-middleware.ts's shape (own copy, see the design
// spec's "independent copy" decision) but without the multi-agent
// allowedSkills/extraDirs layering whatsap needs — this server has exactly
// one agent instance.
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

export function loadSkills(directoryPath = "./skills"): Skill[] {
    if (!fs.existsSync(directoryPath)) {
        return [];
    }

    const entries = fs.readdirSync(directoryPath);
    const skillFiles = entries
        .map((entry) => path.join(directoryPath, entry, "SKILL.md"))
        .filter((filePath) => fs.existsSync(filePath));

    return skillFiles.map((filePath) => {
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
            description: "Load the full content of a skill into the agent's context. Use this when a request matches one of the skills listed in the system prompt's Available Skills section.",
            schema: z.object({
                skillName: z.string().describe("The name of the skill to load"),
            }),
        }
    );

    const skillsPrompt = skills.map((skill) => `- **${skill.name}**: ${skill.description}`).join("\n");

    return createMiddleware({
        name: "skillMiddleware",
        tools: [loadSkill],
        wrapModelCall: async (request, handler) => {
            const skillsAddendum =
                `\n\n## Available Skills\n\n${skillsPrompt}\n\n` +
                "Use the load_skill tool when you need detailed information about handling a specific type of request.";
            return handler({
                ...request,
                systemMessage: request.systemMessage.concat(skillsAddendum),
            });
        },
    });
}

export const skillMiddleware = buildSkillMiddleware(loadSkills());
