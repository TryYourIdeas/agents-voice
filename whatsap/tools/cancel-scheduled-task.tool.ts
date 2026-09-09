import { tool } from "langchain";
import { z } from "zod";
import { archiveTask } from "../lib/tasks.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

export const cancelScheduledTaskTool = tool(
    async ({ name }, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
        if (!parsed) {
            return "Could not cancel task: could not determine which device this conversation belongs to.";
        }
        try {
            archiveTask(parsed.device, name, "cancelled");
            return `Task '${name}' cancelled and archived.`;
        } catch (err: any) {
            return `Could not cancel task '${name}': ${err?.message || String(err)}`;
        }
    },
    {
        name: "cancel_scheduled_task",
        description: "Cancel an active scheduled task by its name (slug), moving it to the archive so it no longer runs.",
        schema: z.object({
            name: z.string().describe("The task's slug/name, as shown by list_scheduled_tasks."),
        }),
    }
);
