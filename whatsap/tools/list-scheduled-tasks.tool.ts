import { tool } from "langchain";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { tasksDir } from "../lib/tasks.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

export const listScheduledTasksTool = tool(
    async (_input, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
        if (!parsed) {
            return "Cannot list tasks: could not determine which device this conversation belongs to.";
        }

        const indexPath = path.join(tasksDir(parsed.device), "index.md");
        if (!existsSync(indexPath)) return "No scheduled tasks yet.";
        return readFileSync(indexPath, "utf-8");
    },
    {
        name: "list_scheduled_tasks",
        description: "List every currently active scheduled task, with its description and schedule.",
        schema: z.object({}),
    }
);
