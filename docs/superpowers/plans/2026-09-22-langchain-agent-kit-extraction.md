# langchain-agent-kit Extraction (PR 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `frontmatter` parsing, the skills progressive-disclosure middleware, and the model-call logging middleware — currently duplicated between `whatsap/` and `ai-extension/server/` — into a new shared package, `lib/langchain-agent-kit/`, consumed by both via a `file:` dependency, with no behavior change to either agent.

**Architecture:** A plain TypeScript package at the repo root (`lib/langchain-agent-kit/`), run the same way both consumers already run (Node native TS execution, no build step). It exports `parseFrontmatter`/`parseMetadataField`/`parseMetadataListField`, `createSkillMiddleware(skillsDir, opts?)`, `loadSkills(skillsDir, extraDirs?)`, and `createLogModelCallMiddleware(opts)`. Both `whatsap/agent.ts` and `ai-extension/server/agent.ts` (plus `whatsap`'s other consumers of these modules) import from it instead of their own copies, which are deleted. Docker build contexts for both `whatsap` and `ai-extension-server` widen to the repo root so the `file:` dependency resolves inside the image, mirroring the existing `llama-server` precedent.

**Tech Stack:** TypeScript (Node v26 native execution, no build step), `langchain@^1.4.0`, `@langchain/core@^1.2.9`, `zod@^4.3.6`, `vitest`, `pnpm@10.30.0`.

**Spec:** `docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`

---

## Before starting

All work happens in `/mnt/data/sources/tryyourideas/web/whatsap-agent` (repo root, remote `github` → `TryYourIdeas/agents-voice`). Branch off `main`:

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git fetch github main
git checkout -b feat/langchain-agent-kit github/main
```

---

## Task 1: Scaffold the `lib/langchain-agent-kit` package

**Files:**
- Create: `lib/langchain-agent-kit/package.json`
- Create: `lib/langchain-agent-kit/tsconfig.json`
- Create: `lib/langchain-agent-kit/vitest.config.ts`
- Create: `lib/langchain-agent-kit/.gitignore`
- Create: `lib/langchain-agent-kit/README.md`

- [ ] **Step 1: Create the package directory and `package.json`**

```json
{
    "name": "langchain-agent-kit",
    "version": "1.0.0",
    "description": "Shared LangChain agent building blocks for whatsap and ai-extension/server: frontmatter parsing, skill middleware, and model-call logging.",
    "type": "module",
    "exports": {
        ".": "./src/index.ts"
    },
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest"
    },
    "dependencies": {
        "langchain": "^1.4.0",
        "@langchain/core": "^1.2.9",
        "zod": "^4.3.6"
    },
    "devDependencies": {
        "typescript": "^5.7.2",
        "vitest": "^5.0.0"
    }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (same compiler options as `ai-extension/server/tsconfig.json`, the more complete of the two existing configs)

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "resolveJsonModule": true,
        "types": ["node"]
    }
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
```

- [ ] **Step 5: Create `README.md`**

```markdown
# langchain-agent-kit

Shared LangChain agent building blocks for `whatsap/` and `ai-extension/server/`:
frontmatter parsing (`parseFrontmatter`, `parseMetadataField`, `parseMetadataListField`),
the skills progressive-disclosure middleware (`createSkillMiddleware`, `loadSkills`), and
model-call logging (`createLogModelCallMiddleware`).

Consumed via a `file:` dependency while it stays workspace-local — see each consumer's own
`package.json`. No build step: like both consumers, this package runs directly via Node's
native TypeScript support.

Run this package's own tests: `pnpm test` (from this directory).
```

- [ ] **Step 6: Install dependencies for the new package**

```bash
cd lib/langchain-agent-kit && pnpm install
```

Expected: creates `lib/langchain-agent-kit/pnpm-lock.yaml` and
`lib/langchain-agent-kit/node_modules`, no errors.

- [ ] **Step 7: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add lib/langchain-agent-kit/package.json lib/langchain-agent-kit/pnpm-lock.yaml \
        lib/langchain-agent-kit/tsconfig.json lib/langchain-agent-kit/vitest.config.ts \
        lib/langchain-agent-kit/.gitignore lib/langchain-agent-kit/README.md
git commit -m "feat: scaffold langchain-agent-kit package"
```

---

## Task 2: Extract `frontmatter.ts`

**Files:**
- Create: `lib/langchain-agent-kit/src/frontmatter.ts`
- Create: `lib/langchain-agent-kit/src/frontmatter.test.ts`

This is a verbatim move of `whatsap/middleware/frontmatter.ts` (the superset — it has
`parseMetadataListField`, which `ai-extension/server`'s copy lacks) and its test file.

- [ ] **Step 1: Create `src/frontmatter.ts`**

```ts
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
// files, agent.md, SKILL.md) naturally get YAML-style quoting around values
// like cron expressions ("* * * * *"), and without this the literal quote
// characters would flow through into consumers like cron-parser and fail
// there instead.
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
```

- [ ] **Step 2: Create `src/frontmatter.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the tests**

```bash
cd lib/langchain-agent-kit && pnpm test
```

Expected: PASS (12 tests).

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add lib/langchain-agent-kit/src/frontmatter.ts lib/langchain-agent-kit/src/frontmatter.test.ts
git commit -m "feat: add frontmatter parsing to langchain-agent-kit"
```

---

## Task 3: Extract `skill-middleware.ts`

**Files:**
- Create: `lib/langchain-agent-kit/src/skill-middleware.ts`
- Create: `lib/langchain-agent-kit/src/skill-middleware.test.ts`

This consolidates `whatsap/middleware/skill-middleware.ts` (the superset, with
`extraDirs`/`allowedSkills` layering) with `ai-extension/server/middleware/skill-middleware.ts`
(simpler, but its test file is the only existing test coverage for this behavior). The
unused `zod` `SkillSchema` from `whatsap`'s version is dropped (`Skill` was only ever used
as a plain type, never runtime-validated).

**Signature change from `whatsap`'s current `createSkillMiddleware(extraDirs?, allowedSkills?)`:**
the base skills directory becomes an explicit first parameter (`skillsDir`, default
`"./skills"`) instead of being hardcoded inside the function — a library function
shouldn't hardcode a path that's only meaningful relative to whichever process's cwd calls
it. `extraDirs`/`allowedSkills` move into an options object as the second parameter.

- [ ] **Step 1: Create `src/skill-middleware.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/skill-middleware.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the tests**

```bash
cd lib/langchain-agent-kit && pnpm test
```

Expected: PASS (all `frontmatter.test.ts` + `skill-middleware.test.ts` tests).

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add lib/langchain-agent-kit/src/skill-middleware.ts lib/langchain-agent-kit/src/skill-middleware.test.ts
git commit -m "feat: add skill-middleware to langchain-agent-kit"
```

---

## Task 4: Extract `log-model-call-middleware.ts`

**Files:**
- Create: `lib/langchain-agent-kit/src/log-model-call-middleware.ts`
- Create: `lib/langchain-agent-kit/src/log-model-call-middleware.test.ts`

Replaces both hardcoded copies with a factory taking a `prefix` and optional `truncate`.
The "model returned" line now always logs `JSON.stringify(lastMessage.content)` rather than
`whatsap`'s previous raw template-literal interpolation (`${lastMessage.content}`, which
stringifies non-string content — e.g. Anthropic content-block arrays — as
`"[object Object]"`) — a strict improvement to a diagnostic-only log line, not a behavior
consumers depend on (nothing asserts this log's exact text anywhere in either project).

- [ ] **Step 1: Create `src/log-model-call-middleware.ts`**

```ts
import { createMiddleware } from "langchain";

// prefix identifies which agent's logs these are, since whatsap and
// ai-extension/server can share the same console (e.g. mixed stdout under
// docker compose). truncate caps the "model returned" line to that many
// characters; omit it to log the full content, uncapped.
export function createLogModelCallMiddleware(opts: { prefix: string; truncate?: number }) {
    const { prefix, truncate } = opts;
    return createMiddleware({
        name: "LoggingMiddleware",
        beforeModel: (state) => {
            console.log(`${prefix} calling model with ${state.messages.length} messages`);
        },
        afterModel: (state) => {
            const lastMessage = state.messages[state.messages.length - 1];
            const content = JSON.stringify(lastMessage.content);
            console.log(`${prefix} model returned: ${truncate ? content.slice(0, truncate) : content}`);
        },
    });
}
```

- [ ] **Step 2: Create `src/log-model-call-middleware.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { createLogModelCallMiddleware } from "./log-model-call-middleware.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createLogModelCallMiddleware", () => {
    it("prefixes both log lines with the given prefix", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const middleware = createLogModelCallMiddleware({ prefix: "[test]" });
        const state = { messages: [new HumanMessage("hello")] };

        middleware.beforeModel?.(state as never, {} as never);
        middleware.afterModel?.(state as never, {} as never);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[test] calling model with 1 messages"));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[test] model returned:"));
    });

    it("truncates the returned-content log line when truncate is given", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const middleware = createLogModelCallMiddleware({ prefix: "[test]", truncate: 10 });
        const state = { messages: [new HumanMessage("a".repeat(100))] };

        middleware.afterModel?.(state as never, {} as never);

        const [, secondCallArg] = logSpy.mock.calls[0];
        expect(secondCallArg).toBeUndefined(); // afterModel only logs once per call
        const loggedLine = logSpy.mock.calls[0][0] as string;
        // "[test] model returned: " + 10 truncated chars from the JSON string
        expect(loggedLine.length).toBeLessThanOrEqual("[test] model returned: ".length + 10);
    });

    it("does not truncate when truncate is omitted", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const middleware = createLogModelCallMiddleware({ prefix: "[test]" });
        const longContent = "a".repeat(1000);
        const state = { messages: [new HumanMessage(longContent)] };

        middleware.afterModel?.(state as never, {} as never);

        const loggedLine = logSpy.mock.calls[0][0] as string;
        expect(loggedLine.length).toBeGreaterThan(1000);
    });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd lib/langchain-agent-kit && pnpm test
```

Expected: PASS. If `middleware.beforeModel`/`afterModel` aren't callable the way the test
assumes (the exact call signature `createMiddleware` produces can vary by `langchain`
version), adjust the test to call them the way `langchain`'s own middleware runtime does —
check `node_modules/langchain/dist/**/middleware*.d.ts` in this package for the actual
`beforeModel`/`afterModel` handler signature if the first attempt doesn't type-check or run.

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add lib/langchain-agent-kit/src/log-model-call-middleware.ts lib/langchain-agent-kit/src/log-model-call-middleware.test.ts
git commit -m "feat: add log-model-call-middleware to langchain-agent-kit"
```

---

## Task 5: Barrel export

**Files:**
- Create: `lib/langchain-agent-kit/src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```ts
export { parseFrontmatter, parseMetadataField, parseMetadataListField } from "./frontmatter.ts";
export type { ParsedFrontmatter } from "./frontmatter.ts";

export { createSkillMiddleware, loadSkills } from "./skill-middleware.ts";
export type { Skill } from "./skill-middleware.ts";

export { createLogModelCallMiddleware } from "./log-model-call-middleware.ts";
```

- [ ] **Step 2: Run the full kit test suite**

```bash
cd lib/langchain-agent-kit && pnpm test
```

Expected: PASS, all tests from Tasks 2-4.

- [ ] **Step 3: Type-check the package**

```bash
cd lib/langchain-agent-kit && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add lib/langchain-agent-kit/src/index.ts
git commit -m "feat: add langchain-agent-kit barrel export"
```

---

## Task 6: Wire `whatsap/` to consume the kit

**Files:**
- Modify: `whatsap/package.json`
- Modify: `whatsap/agent.ts`
- Modify: `whatsap/named-agents.ts`
- Modify: `whatsap/device-onboarding.ts`
- Modify: `whatsap/lib/devices.ts`
- Modify: `whatsap/lib/tasks.ts`
- Delete: `whatsap/middleware/frontmatter.ts`, `whatsap/middleware/frontmatter.test.ts`
- Delete: `whatsap/middleware/skill-middleware.ts`
- Delete: `whatsap/middleware/log-model-call-middleware.ts`

- [ ] **Step 1: Add the dependency**

In `whatsap/package.json`, inside `"dependencies"`, add (keep the list alphabetized like
the rest of it):

```json
    "langchain-agent-kit": "file:../lib/langchain-agent-kit",
```

Then:

```bash
cd whatsap && pnpm install
```

Expected: no errors; `whatsap/node_modules/langchain-agent-kit` exists (as a symlink to
`../../lib/langchain-agent-kit`). If pnpm refuses because `whatsap/pnpm-workspace.yaml`
makes `whatsap/` its own workspace root and rejects a `file:` path outside it, report the
exact error text before working around it — don't guess a fix.

- [ ] **Step 2: Update `whatsap/agent.ts`**

Change:
```ts
import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { skillMiddleware } from "./middleware/skill-middleware.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { agentDelegationMiddleware } from "./middleware/agent-delegation-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";
import { extractText } from "./util.ts";
```
to:
```ts
import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { agentDelegationMiddleware } from "./middleware/agent-delegation-middleware.ts";
import { extractText } from "./util.ts";
import { createSkillMiddleware, createLogModelCallMiddleware } from "langchain-agent-kit";

const skillMiddleware = createSkillMiddleware("./skills");
const logModelCallMiddleware = createLogModelCallMiddleware({ prefix: "[Middleware]" });
```

(the two `const` lines go right after the imports, before `const executerSystemPrompt = ...`)

- [ ] **Step 3: Update `whatsap/named-agents.ts`**

Change:
```ts
import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { createSkillMiddleware } from "./middleware/skill-middleware.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";
import { parseFrontmatter, parseMetadataField, parseMetadataListField } from "./middleware/frontmatter.ts";
import { extractText } from "./util.ts";
```
to:
```ts
import { model, sharedTools, sharedCheckpointer } from "./shared.ts";
import { createMemoryMiddleware } from "./middleware/memory-middleware.ts";
import { extractText } from "./util.ts";
import {
    createSkillMiddleware,
    createLogModelCallMiddleware,
    parseFrontmatter,
    parseMetadataField,
    parseMetadataListField,
} from "langchain-agent-kit";

const logModelCallMiddleware = createLogModelCallMiddleware({ prefix: "[Middleware]" });
```

Then update the call site — change:
```ts
        middleware: [
            createSkillMiddleware([agentSkillsDir], header.allowedSkills),
            createMemoryMiddleware(`devices/${deviceName}/memory`),
            logModelCallMiddleware,
        ],
```
to:
```ts
        middleware: [
            createSkillMiddleware("./skills", { extraDirs: [agentSkillsDir], allowedSkills: header.allowedSkills }),
            createMemoryMiddleware(`devices/${deviceName}/memory`),
            logModelCallMiddleware,
        ],
```

- [ ] **Step 4: Update `whatsap/device-onboarding.ts`**

Change:
```ts
import { parseFrontmatter, parseMetadataField } from "./middleware/frontmatter.ts";
```
to:
```ts
import { parseFrontmatter, parseMetadataField } from "langchain-agent-kit";
```

- [ ] **Step 5: Update `whatsap/lib/devices.ts`**

Change:
```ts
import { parseFrontmatter, parseMetadataField } from "../middleware/frontmatter.ts";
```
to:
```ts
import { parseFrontmatter, parseMetadataField } from "langchain-agent-kit";
```

- [ ] **Step 6: Update `whatsap/lib/tasks.ts`**

Change:
```ts
import { parseFrontmatter, parseMetadataField } from "../middleware/frontmatter.ts";
```
to:
```ts
import { parseFrontmatter, parseMetadataField } from "langchain-agent-kit";
```

- [ ] **Step 7: Delete the old files**

```bash
cd whatsap
rm middleware/frontmatter.ts middleware/frontmatter.test.ts
rm middleware/skill-middleware.ts
rm middleware/log-model-call-middleware.ts
```

- [ ] **Step 8: Run whatsap's test suite**

```bash
cd whatsap && pnpm test
```

Expected: PASS, same test count as before this task minus the deleted
`middleware/frontmatter.test.ts` (now covered by the kit's own tests instead).

- [ ] **Step 9: Type-check (if whatsap has a type-check script; otherwise skip)**

```bash
cd whatsap && npx tsc --noEmit
```

Expected: no errors, or a pre-existing baseline of errors unrelated to this change (compare
against `git stash` if unsure whether an error predates this task).

- [ ] **Step 10: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add whatsap/package.json whatsap/pnpm-lock.yaml whatsap/agent.ts whatsap/named-agents.ts \
        whatsap/device-onboarding.ts whatsap/lib/devices.ts whatsap/lib/tasks.ts
git rm whatsap/middleware/frontmatter.ts whatsap/middleware/frontmatter.test.ts \
       whatsap/middleware/skill-middleware.ts whatsap/middleware/log-model-call-middleware.ts
git commit -m "refactor: consume langchain-agent-kit from whatsap"
```

---

## Task 7: Wire `ai-extension/server/` to consume the kit

**Files:**
- Modify: `ai-extension/server/package.json`
- Modify: `ai-extension/server/agent.ts`
- Delete: `ai-extension/server/middleware/frontmatter.ts`, `.test.ts`
- Delete: `ai-extension/server/middleware/skill-middleware.ts`, `.test.ts`
- Delete: `ai-extension/server/middleware/log-model-call-middleware.ts`

- [ ] **Step 1: Add the dependency**

In `ai-extension/server/package.json`, inside `"dependencies"`, add:

```json
        "langchain-agent-kit": "file:../../lib/langchain-agent-kit",
```

Then:

```bash
cd ai-extension/server && pnpm install
```

Expected: no errors; `ai-extension/server/node_modules/langchain-agent-kit` exists.

- [ ] **Step 2: Update `ai-extension/server/agent.ts`**

Change:
```ts
import { skillMiddleware } from "./middleware/skill-middleware.ts";
import { logModelCallMiddleware } from "./middleware/log-model-call-middleware.ts";
```
to:
```ts
import { createSkillMiddleware, createLogModelCallMiddleware } from "langchain-agent-kit";

const skillMiddleware = createSkillMiddleware("./skills");
const logModelCallMiddleware = createLogModelCallMiddleware({ prefix: "[ai-extension]", truncate: 500 });
```

(these two `const` lines can go right where the old imports were, since they're both
top-level module state either way — before the `if (!process.env.ANTHROPIC_MODEL)` check
or after; keep them adjacent to where `model`/`checkpointer` are defined further down for
readability, i.e. just above `const agent = createAgent({...})`)

- [ ] **Step 3: Delete the old files**

```bash
cd ai-extension/server
rm middleware/frontmatter.ts middleware/frontmatter.test.ts
rm middleware/skill-middleware.ts middleware/skill-middleware.test.ts
rm middleware/log-model-call-middleware.ts
```

- [ ] **Step 4: Run ai-extension/server's test suite**

```bash
cd ai-extension/server && pnpm test
```

Expected: PASS, same test count minus the two deleted `.test.ts` files (now covered by the
kit's own tests).

- [ ] **Step 5: Type-check**

```bash
cd ai-extension/server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add ai-extension/server/package.json ai-extension/server/pnpm-lock.yaml ai-extension/server/agent.ts
git rm ai-extension/server/middleware/frontmatter.ts ai-extension/server/middleware/frontmatter.test.ts \
       ai-extension/server/middleware/skill-middleware.ts ai-extension/server/middleware/skill-middleware.test.ts \
       ai-extension/server/middleware/log-model-call-middleware.ts
git commit -m "refactor: consume langchain-agent-kit from ai-extension/server"
```

---

## Task 8: Widen Docker build contexts so the `file:` dependency resolves in images

Both `whatsap/Dockerfile` and `ai-extension/server/Dockerfile` currently build with their
own directory as context (`build: ./whatsap`, `build: ./ai-extension/server` in
`docker-compose-whatsap.yml`), so neither can see the repo-root `lib/` their new `file:`
dependency points at. Fix: widen both to `context: .` (repo root) + an explicit
`dockerfile:` path, the same pattern `llama-server/Dockerfile` already uses in the root
`docker-compose.yml`. `COPY` paths inside both Dockerfiles become root-relative.

Both consumers' `file:` paths (`../lib/langchain-agent-kit` from `whatsap/`,
`../../lib/langchain-agent-kit` from `ai-extension/server/`) resolve to the same
`/lib/langchain-agent-kit` when the package is copied there under `WORKDIR /app`, because
path resolution above the filesystem root clamps to root (`/app/../../lib` normalizes to
`/lib`, same as `/app/../lib`) — so both Dockerfiles copy the kit to that same in-image path.

**Files:**
- Modify: `docker-compose-whatsap.yml`
- Modify: `whatsap/Dockerfile`
- Modify: `ai-extension/server/Dockerfile`
- Modify: `.dockerignore` (repo root)
- Delete: `whatsap/.dockerignore`, `ai-extension/server/.dockerignore`

- [ ] **Step 1: Update `docker-compose-whatsap.yml`**

Change:
```yaml
  whatsap:
    build: ./whatsap
    image: agents-voice-whatsap:latest
```
to:
```yaml
  whatsap:
    build:
      context: .
      dockerfile: whatsap/Dockerfile
    image: agents-voice-whatsap:latest
```

Change:
```yaml
  ai-extension-server:
    build: ./ai-extension/server
    image: ai-extension-server:latest
```
to:
```yaml
  ai-extension-server:
    build:
      context: .
      dockerfile: ai-extension/server/Dockerfile
    image: ai-extension-server:latest
```

- [ ] **Step 2: Update `whatsap/Dockerfile`**

Change:
```dockerfile
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN chmod +x docker-entrypoint.sh
```
to:
```dockerfile
WORKDIR /app

# Build context is now the repo root (see docker-compose-whatsap.yml), so
# langchain-agent-kit is copied to /lib — this package's own
# "file:../lib/langchain-agent-kit" dependency then resolves against it
# exactly like it does on disk, where whatsap/ and lib/ are sibling
# directories under the repo root.
COPY lib/langchain-agent-kit /lib/langchain-agent-kit
COPY whatsap/package.json whatsap/pnpm-lock.yaml whatsap/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY whatsap/ .
RUN chmod +x docker-entrypoint.sh
```

- [ ] **Step 3: Update `ai-extension/server/Dockerfile`**

Change:
```dockerfile
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
```
to:
```dockerfile
WORKDIR /app

# Build context is now the repo root (see docker-compose-whatsap.yml).
# langchain-agent-kit is copied to /lib — this package's
# "file:../../lib/langchain-agent-kit" dependency resolves against it the
# same way it does on disk (ai-extension/server -> ai-extension -> repo
# root -> lib): path resolution above the filesystem root clamps to root,
# so both this and whatsap's single-".." path land on the same /lib.
COPY lib/langchain-agent-kit /lib/langchain-agent-kit
COPY ai-extension/server/package.json ai-extension/server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY ai-extension/server/ .
```

- [ ] **Step 4: Delete the now-unused per-directory `.dockerignore` files**

Docker only reads `.dockerignore` from the build context root; once both builds' context is
the repo root, `whatsap/.dockerignore` and `ai-extension/server/.dockerignore` are dead.

```bash
git rm whatsap/.dockerignore ai-extension/server/.dockerignore
```

- [ ] **Step 5: Rewrite the root `.dockerignore`**

Replace the entire contents of `.dockerignore` with:

```
# Root build context is used by llama-server/Dockerfile (CPU) and
# llama-server/Dockerfile.gpu (GPU) — needs llama/, llama-gpu/,
# model-qwen3.5/, start-llama-server*.sh — and by whatsap/Dockerfile and
# ai-extension/server/Dockerfile, which additionally need lib/ (the shared
# langchain-agent-kit package their file: dependency resolves against).
# Everything else here would otherwise be sent to the Docker daemon as
# build context for no reason.
*
!llama/
!llama/**
!llama-gpu/
!llama-gpu/**
!model-qwen3.5/
!model-qwen3.5/**
!start-llama-server.sh
!start-llama-server-gpu.sh

!whatsap/**
whatsap/node_modules
whatsap/node_modules/**
whatsap/.env
whatsap/.env.*
whatsap/.git
whatsap/.wwebjs_cache
whatsap/devices
whatsap/devices/**
whatsap/new-devices
whatsap/new-devices/**
whatsap/logs*.txt
whatsap/*.md
!whatsap/README.md

!ai-extension/server/**
ai-extension/server/node_modules
ai-extension/server/node_modules/**
ai-extension/server/.env
ai-extension/server/.env.*
ai-extension/server/*.test.ts

!lib/**
lib/**/node_modules
lib/**/node_modules/**
```

- [ ] **Step 6: Build both images and confirm the dependency resolves**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
docker compose -f docker-compose-whatsap.yml build whatsap ai-extension-server
```

Expected: both images build successfully, with `pnpm install --frozen-lockfile` succeeding
in each (this is the actual proof the `file:` dependency resolves inside the image). If
either build fails on the `pnpm install` step, read the exact error — most likely cause is
a `.dockerignore` pattern excluding something `lib/langchain-agent-kit` needs (check with
`docker build --no-cache --progress=plain -f whatsap/Dockerfile .` for verbose output up to
the failing step) rather than a `file:` resolution problem per se.

- [ ] **Step 7: Commit**

```bash
git add docker-compose-whatsap.yml whatsap/Dockerfile ai-extension/server/Dockerfile .dockerignore
git commit -m "config: widen whatsap and ai-extension-server docker build contexts for langchain-agent-kit"
```

---

## Task 9: Update documentation

**Files:**
- Modify: `whatsap/CLAUDE.md`
- Modify: `ai-extension/server/CLAUDE.md`
- Modify: `docs/changes.md` (create if it doesn't exist, per the workspace root `CLAUDE.md`'s
  documentation conventions)

- [ ] **Step 1: Check whether `docs/changes.md` exists**

```bash
ls docs/changes.md 2>&1
```

- [ ] **Step 2: Update `whatsap/CLAUDE.md`**

In the "Architecture" section, change the `agent.ts` bullet's middleware description:

Find:
```
- `middleware/skill-middleware.ts` — a progressive-disclosure "skills" system for the *agent itself* (distinct from Claude Code's own Skill tool). At load time it scans every subdirectory of `./skills/` for a `SKILL.md`, parses the `name`/`description` out of its frontmatter, and injects a `## Available Skills` list into the system prompt. It also exposes a `load_skill` tool the agent can call to pull a skill's full body into context on demand.
- `middleware/log-model-call-middleware.ts` — logs before/after every model call to the console.
```

Replace with:
```
- `createSkillMiddleware`/`createLogModelCallMiddleware` (from the shared `langchain-agent-kit` package, `lib/langchain-agent-kit/` — also consumed by `ai-extension/server`) — `createSkillMiddleware` is a progressive-disclosure "skills" system for the *agent itself* (distinct from Claude Code's own Skill tool). At load time it scans every subdirectory of `./skills/` (plus any `extraDirs`) for a `SKILL.md`, parses the `name`/`description` out of its frontmatter, and injects a `## Available Skills` list into the system prompt. It also exposes a `load_skill` tool the agent can call to pull a skill's full body into context on demand. `createLogModelCallMiddleware` logs before/after every model call to the console.
```

Also update the top-of-file description that currently says frontmatter parsing is
project-local — search for any mention of `middleware/frontmatter.ts` and note instead that
`parseFrontmatter`/`parseMetadataField`/`parseMetadataListField` now come from
`langchain-agent-kit`.

- [ ] **Step 3: Update `ai-extension/server/CLAUDE.md`**

Change:
```
Same agent shape as
`whatsap/agent.ts` (file/directory/bash tools, skill-middleware, `MemorySaver` checkpointer)
but its own independent instance — see
`docs/superpowers/specs/2026-09-19-ai-extension-design.md` for why.
```
to:
```
Same agent shape as
`whatsap/agent.ts` (file/directory/bash tools, skill-middleware, `MemorySaver` checkpointer)
but its own independent `createAgent` instance. Its skill-middleware, frontmatter parsing,
and model-call logging now come from the shared `langchain-agent-kit` package
(`lib/langchain-agent-kit/`, also consumed by `whatsap`) rather than being separate
copies — see `docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`.
The file/directory/bash tools themselves remain this project's own (see
`docs/superpowers/specs/2026-09-19-ai-extension-design.md` for the original
independent-copy rationale, which still applies to those).
```

And in the "Architecture" section, change:
```
- `middleware/skill-middleware.ts` + `skills/*/SKILL.md` — progressive-disclosure skill
  system, same pattern as whatsap's own (own copy, not shared).
```
to:
```
- `skills/*/SKILL.md` — content for the shared `createSkillMiddleware`'s (from
  `langchain-agent-kit`) progressive-disclosure skill system.
```

- [ ] **Step 4: Add or update `docs/changes.md`**

If it doesn't exist, create it with:
```markdown
# Changes

## 2026-09-22 — Extract langchain-agent-kit shared package

`whatsap/` and `ai-extension/server/` each ran their own copy of frontmatter parsing, the
skills progressive-disclosure middleware, and model-call logging — copies that had drifted
(`whatsap`'s skill-middleware gained multi-agent `extraDirs`/`allowedSkills` support that
`ai-extension`'s never got). Extracted all three into `lib/langchain-agent-kit/`, a shared
TypeScript package consumed via a `file:` dependency by both. No behavior change to either
agent. See `docs/superpowers/specs/2026-09-22-langchain-agent-kit-extraction-design.md`.

File/directory/bash tools remain project-specific for now (deferred to a follow-up PR —
they take different shapes between the two agents).
```

If it exists, prepend this entry under its own `## 2026-09-22 — ...` heading, matching
whatever format the existing file already uses.

- [ ] **Step 5: Commit**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
git add whatsap/CLAUDE.md ai-extension/server/CLAUDE.md docs/changes.md
git commit -m "docs: document langchain-agent-kit extraction"
```

---

## Task 10: Final verification and PR

- [ ] **Step 1: Run both consumers' full test suites once more from a clean install**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent/whatsap && pnpm install && pnpm test
cd /mnt/data/sources/tryyourideas/web/whatsap-agent/ai-extension/server && pnpm install && pnpm test
cd /mnt/data/sources/tryyourideas/web/whatsap-agent/lib/langchain-agent-kit && pnpm test
```

Expected: all three PASS.

- [ ] **Step 2: Confirm no leftover references to the deleted files**

```bash
cd /mnt/data/sources/tryyourideas/web/whatsap-agent
grep -rn "middleware/frontmatter\|middleware/skill-middleware\|middleware/log-model-call-middleware" whatsap ai-extension/server --include="*.ts" | grep -v node_modules
```

Expected: no output.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u github feat/langchain-agent-kit
```

Then use `gh pr create` (see this repo's established pattern of extracting the token from
the `github` remote URL if `gh auth status` shows an account without collaborator access —
`TOKEN=$(git remote get-url github | sed -n 's#.*://[^:]*:\([^@]*\)@.*#\1#p')` and
`GH_TOKEN="$TOKEN" gh pr create ...`) with a title like "refactor: extract
langchain-agent-kit shared package (PR 1 of 2)" and a body summarizing the change, linking
the spec, and noting the follow-up PR 2 (file/directory/bash tools) is out of scope here.

---

## Self-review notes

- **Spec coverage:** every section of the spec (`New package`, `frontmatter.ts`,
  `skill-middleware.ts`, `log-model-call-middleware.ts`, `Behavior preservation`,
  `Consumer updates`, `Testing`, `Rollout`/Docker gotcha) has a corresponding task above.
- **Path correction from the spec:** the spec's "Consumer updates" section wrote
  `file:../../lib/langchain-agent-kit` for *both* consumers; that's only correct for
  `ai-extension/server` (two directories deep from the repo root). `whatsap/` is one
  directory deep, so its correct relative path is `file:../lib/langchain-agent-kit` — this
  plan uses the corrected path in Task 6/Task 8.
- **Type consistency:** `createSkillMiddleware(skillsDir, opts?)` and
  `createLogModelCallMiddleware(opts)` signatures are identical across Task 3/4 (kit
  implementation) and Task 6/7 (call sites) — checked call sites in `agent.ts`,
  `named-agents.ts` (kit), and both projects' `agent.ts` use the same shape.
