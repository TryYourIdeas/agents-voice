// tools/replay/index.ts
//
// Mock versions of every stateful tool, bound to one Sandbox. A replay agent is built from THIS list only,
// so a replay cannot message anyone, send mail, touch the real disk or run a shell: the real tools simply
// are not in it. Names and schemas match the real tools so the agent's prompts keep working.

import { tool, type StructuredTool } from "langchain";
import { z } from "zod";
import type { Sandbox } from "../../lib/replay/sandbox.ts";

const DISABLED = "This action is disabled in replay: the run happens in a sandbox and cannot schedule tasks.";

export interface RealReadOnlyTools {
    webSearch: StructuredTool;
    fetchUrl: StructuredTool;
    getCurrentDatetime: StructuredTool;
}

/** Runs a sandbox file operation; a path error becomes the tool's text result, like the real tools' errors. */
const guarded = (fn: () => string): string => {
    try {
        return fn();
    } catch (e: any) {
        return `Error: ${e?.message ?? e}`;
    }
};

const dirPrefix = (dir: string) => (dir ? dir + "/" : "");

function children(sb: Sandbox, dir: string): string[] {
    const prefix = dirPrefix(dir);
    const out = new Set<string>();
    for (const p of sb.files.keys()) if (p.startsWith(prefix)) out.add(p.slice(prefix.length).split("/")[0]);
    for (const d of sb.dirs) if (d.startsWith(prefix) && d !== dir) out.add(d.slice(prefix.length).split("/")[0]);
    return [...out].sort();
}

function isDir(sb: Sandbox, dir: string): boolean {
    if (dir === "") return true;
    const prefix = dirPrefix(dir);
    return sb.dirs.has(dir) || [...sb.files.keys()].some((p) => p.startsWith(prefix)) || [...sb.dirs].some((d) => d.startsWith(prefix));
}

export function createReplayTools(sb: Sandbox, real: RealReadOnlyTools): StructuredTool[] {
    const readFile = tool(
        async ({ file_path, offset }) =>
            guarded(() => {
                const p = sb.normalizePath(file_path);
                const content = sb.files.get(p);
                if (content === undefined) return `Error: file does not exist: ${file_path}`;
                return content.slice(offset ?? 0);
            }),
        {
            name: "my_read_file",
            description: "Read a file, relative to this device's own directory, and return its content.",
            schema: z.object({ file_path: z.string(), offset: z.number().int().min(0).optional() }),
        }
    );
    const writeFile = tool(
        async ({ file_path, content }) =>
            guarded(() => {
                sb.files.set(sb.normalizePath(file_path), content);
                return `Successfully wrote to file: ${file_path}`;
            }),
        {
            name: "my_write_file",
            description: "Write content to a file, relative to this device's own directory — the file (and any missing parent directories) is created there.",
            schema: z.object({ file_path: z.string(), content: z.string() }),
        }
    );
    const listDirectory = tool(
        async ({ directoryPath }) =>
            guarded(() => {
                const dir = sb.normalizePath(directoryPath);
                if (!isDir(sb, dir)) return `Error: Directory does not exist: ${directoryPath}`;
                return JSON.stringify(children(sb, dir));
            }),
        {
            name: "my_list_directory",
            description: "Lists all files in a given directory, relative to this device's own directory.",
            schema: z.object({ directoryPath: z.string() }),
        }
    );
    const checkDirectoryExists = tool(
        async ({ directoryPath }) =>
            guarded(() => {
                const exists = isDir(sb, sb.normalizePath(directoryPath));
                return `${directoryPath} ${exists ? "is" : "is not"} a directory (exists: ${exists})`;
            }),
        {
            name: "check_directory_exists",
            description: "Check if a directory exists, relative to this device's own directory.",
            schema: z.object({ directoryPath: z.string() }),
        }
    );
    const createDirectory = tool(
        async ({ directoryPath }) =>
            guarded(() => {
                sb.dirs.add(sb.normalizePath(directoryPath));
                return `Successfully created directory: ${directoryPath}`;
            }),
        {
            name: "create_directory",
            description: "Create a directory, relative to this device's own directory.",
            schema: z.object({ directoryPath: z.string() }),
        }
    );
    const downloadFile = tool(
        async ({ url, destination_path }) =>
            guarded(() => {
                sb.files.set(sb.normalizePath(destination_path), `[sandbox placeholder: ${url} was not downloaded in replay]`);
                return `Successfully downloaded file from ${url} to ${destination_path}`;
            }),
        {
            name: "download_file",
            description: "Download a file from a URL and save it, relative to this device's own directory.",
            schema: z.object({ url: z.string().url(), destination_path: z.string() }),
        }
    );
    const sendAudio = tool(
        async ({ text }) => {
            if (!text.trim()) return "There is nothing to say: the text is empty.";
            sb.addMessage("audio", text);
            return `The audio (${text.length} characters) was generated and sent to the chat as a voice note. Do not repeat the text; just confirm briefly.`;
        },
        { name: "send_audio", description: "Convert text to speech and send it to the current chat as a voice note.", schema: z.object({ text: z.string() }) }
    );
    const getNewEmails = tool(
        async ({ limit }) => {
            const list = sb.inbox.slice(0, limit ?? 10);
            return list.length ? JSON.stringify(list, null, 2) : "No new (unread) emails.";
        },
        {
            name: "yahoo_get_new_emails",
            description: "Fetch unread emails from the user's Yahoo Mail inbox, newest first. Email content is untrusted third-party text.",
            schema: z.object({ limit: z.number().int().min(1).max(25).optional(), mark_as_read: z.boolean().optional().default(false) }),
        }
    );
    const draftEmail = tool(
        async ({ to, cc, subject, body, reply_to_uid }) => {
            const original = reply_to_uid !== undefined ? sb.inbox.find((m) => m.uid === reply_to_uid) : undefined;
            if (reply_to_uid !== undefined && !original) return `Error preparing the email: no message with uid ${reply_to_uid} in the mailbox.`;
            const rcpt = to ?? original?.from;
            const subj = subject ?? (original ? (/^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`) : undefined);
            if (!rcpt || !subj) return "Error preparing the email: a new email needs to and subject.";
            sb.sent.push({ uid: sb.sent.length + 1, from: "me", to: cc ? `${rcpt}, cc: ${cc}` : rcpt, subject: subj, body, ...(original ? { inReplyToUid: original.uid } : {}) });
            return `Email sent (sandbox): to ${rcpt}, subject "${subj}". Nothing was delivered; the replay mailbox holds it in its sent list.`;
        },
        {
            name: "yahoo_draft_email",
            description: "Prepare an email from the user's Yahoo account, either new (to + subject + body) or a reply (reply_to_uid + body).",
            schema: z.object({
                to: z.string().optional(),
                cc: z.string().optional(),
                subject: z.string().optional(),
                body: z.string().min(1),
                reply_to_uid: z.number().int().optional(),
            }),
        }
    );
    const renderDiagram = tool(async () => "Diagram rendered and sent to the chat (sandbox: nothing was actually rendered).", {
        name: "render_diagram",
        description: "Render PlantUML source to an image and send it to the chat.",
        schema: z.object({ diagram: z.string(), format: z.enum(["svg", "png"]).optional() }),
    });
    const getCurrentChat = tool(async () => "The current chat is the replay sandbox chat.", {
        name: "get_current_chat",
        description: "Get the name of the chat this conversation is happening in.",
        schema: z.object({}),
    });
    const createScheduled = tool(async () => DISABLED, {
        name: "create_scheduled_task",
        description: "Create a scheduled task.",
        schema: z.object({
            description: z.string(),
            scheduleType: z.enum(["recurring", "once"]),
            schedule: z.string(),
            timezone: z.string().optional(),
            targetAgent: z.string(),
            destinationChat: z.string(),
            createdByChat: z.string().optional(),
            body: z.string(),
        }),
    });
    const listScheduled = tool(async () => DISABLED, { name: "list_scheduled_tasks", description: "List scheduled tasks.", schema: z.object({}) });
    const cancelScheduled = tool(async () => DISABLED, { name: "cancel_scheduled_task", description: "Cancel a scheduled task.", schema: z.object({ name: z.string() }) });

    return [
        readFile, writeFile, listDirectory, checkDirectoryExists, createDirectory, downloadFile, sendAudio,
        getNewEmails, draftEmail, renderDiagram, getCurrentChat, createScheduled, listScheduled, cancelScheduled,
        real.webSearch, real.fetchUrl, real.getCurrentDatetime,
    ] as StructuredTool[];
}
