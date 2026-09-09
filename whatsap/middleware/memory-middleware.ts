import { createMiddleware } from "langchain";
import fs from "node:fs";
import path from "node:path";

// Persistent memory across sessions/restarts, now scoped per device (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md) — one
// file per memory, plus a single index.md pointing to each with a
// one-line description. Bind-mounted under devices/<device>/memory in
// docker-compose-whatsap.yml so writes survive container recreates.
//
// A factory, not a singleton, because each device (and within a device,
// each agent instance — see agent.ts/named-agents.ts) needs its own scoped
// memory directory — same reasoning as skill-middleware.ts's
// createSkillMiddleware.
export function createMemoryMiddleware(memoryDir: string) {
    const indexPath = path.join(memoryDir, "index.md");
    const defaultIndex = `# Memory Index

Pointers to persisted memory files under this directory. Each entry: a link to the file plus a
one-line description of what it's about, so an agent can decide whether to read the full file
without loading everything into context.

(No memories yet.)
`;

    function readIndex(): string {
        fs.mkdirSync(memoryDir, { recursive: true });
        if (!fs.existsSync(indexPath)) {
            fs.writeFileSync(indexPath, defaultIndex);
        }
        return fs.readFileSync(indexPath, "utf-8");
    }

    return createMiddleware({
        name: "memoryMiddleware",
        wrapModelCall: async (request, handler) => {
            // Re-read on every call (not cached like skills) since memory can
            // change mid-conversation, e.g. right after the agent just wrote to
            // it in a previous tool-call round.
            const index = readIndex();

            const memoryAddendum =
                `\n\n## Memory\n\n` +
                `You have persistent memory across sessions in the \`${memoryDir}\` directory, ` +
                `using the read_file/write_file/list_directory tools. \`${indexPath}\` (below) lists ` +
                `every memory file with a one-line description.\n\n` +
                `- Before assuming you don't know something, check whether the index lists a file ` +
                `that looks relevant, and read it.\n` +
                `- When you learn something worth remembering for future sessions — a fact, a ` +
                `preference, ongoing context, or a piece of user-provided data — write it to a new or ` +
                `existing file under ${memoryDir}/, then add or update its one-line entry in ` +
                `${indexPath} so it stays discoverable. A memory that isn't indexed is effectively lost.\n` +
                `- Keep each memory file focused on one topic, and each index entry to one line.\n` +
                `- CRITICAL: if the user explicitly asks you to remember, save, persist, or not-forget ` +
                `something (e.g. "remember X", "save this for later", "don't make me repeat this"), ` +
                `you MUST actually call write_file to save it and update the index BEFORE you reply — ` +
                `in the same turn, before your final answer. Replying "I'll remember that" or "noted" ` +
                `WITHOUT calling write_file does not save anything and is a failure to follow this ` +
                `instruction, even if you already have the information in this conversation.\n\n` +
                `Current index (${indexPath}):\n\n${index}`;

            return handler({
                ...request,
                systemMessage: request.systemMessage.concat(memoryAddendum),
            });
        },
    });
}
