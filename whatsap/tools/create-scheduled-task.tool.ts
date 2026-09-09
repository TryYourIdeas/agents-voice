import { tool } from "langchain";
import { z } from "zod";
import { slugify, writeNewTask, type ScheduledTask } from "../lib/tasks.ts";
import { parseDeviceThreadId } from "../lib/devices.ts";

export const createScheduledTaskTool = tool(
    async ({ description, scheduleType, schedule, timezone, targetAgent, destinationChat, createdByChat, body }, config) => {
        const threadId = config?.configurable?.thread_id as string | undefined;
        const parsed = threadId ? parseDeviceThreadId(threadId) : undefined;
        if (!parsed) {
            return "Cannot create task: could not determine which device this task belongs to.";
        }

        if (!description || description.trim().length < 10) {
            return "Cannot create task: 'description' is missing or too short. It must state where the output goes and what communication should happen (e.g. 'sends a WhatsApp reminder to the chat it was created in'). Ask the user, then try again.";
        }
        if (!/chat|message|send|notif|reply|whatsapp/i.test(description)) {
            return "Cannot create task: 'description' doesn't mention where the output goes or what communication happens. Ask the user to clarify, then try again.";
        }
        if (!schedule || !schedule.trim()) {
            return "Cannot create task: 'schedule' is missing. Confirm the timing with the user (and convert it to a cron expression or ISO datetime) before calling this tool again.";
        }
        if (!destinationChat || !destinationChat.trim()) {
            return "Cannot create task: 'destinationChat' is missing. Confirm which chat should receive the result before calling this tool again.";
        }
        if (!targetAgent || !targetAgent.trim()) {
            return "Cannot create task: 'targetAgent' is missing — use \"default\" unless the user wants a specific named agent.";
        }
        if (!body || !body.trim()) {
            return "Cannot create task: 'body' (the instruction to run when this fires) is missing.";
        }

        const name = slugify(parsed.device, description);
        const task: ScheduledTask = {
            name,
            description: description.trim(),
            scheduleType,
            schedule: schedule.trim(),
            timezone: timezone?.trim() || "UTC",
            targetAgent: targetAgent.trim(),
            destinationChat: destinationChat.trim(),
            createdByChat: createdByChat?.trim() || destinationChat.trim(),
            status: "active",
            body: body.trim(),
        };
        writeNewTask(parsed.device, task);
        return `Scheduled task '${name}' created. ${
            scheduleType === "once" ? `Runs once at ${task.schedule}` : `Runs on schedule '${task.schedule}' (timezone ${task.timezone})`
        }, output goes to '${task.destinationChat}'.`;
    },
    {
        name: "create_scheduled_task",
        description:
            "Create a new scheduled task after confirming every detail with the user: what the task should do " +
            "(becomes the task body sent to the target agent), when it runs (translate natural language into a " +
            "cron expression for recurring tasks, or an ISO datetime for one-off tasks), which agent should " +
            "handle it ('default' or a named agent), and which chat the result should be sent to. Do not call " +
            "this until all of that is confirmed and unambiguous — if the tool returns a validation failure, " +
            "ask the user the missing question and call it again once you have the answer.",
        schema: z.object({
            description: z.string().describe(
                "Human-readable summary of the task, MUST state where the output goes and what communication happens (e.g. 'sends a WhatsApp reminder to the chat it was created in')."
            ),
            scheduleType: z.enum(["recurring", "once"]),
            schedule: z.string().describe("A cron expression (recurring) or ISO 8601 datetime (once)."),
            timezone: z.string().optional().describe("IANA timezone, e.g. 'America/Argentina/Buenos_Aires'. Defaults to UTC if omitted."),
            targetAgent: z.string().describe("'default' or the slug of a named agent under ./agents."),
            destinationChat: z.string().describe("Display name of the chat the result should be sent to (as shown by '@ai list channels')."),
            createdByChat: z.string().optional().describe("Display name of the chat this task was created from, if known."),
            body: z.string().describe("The instruction sent to the target agent when this task fires."),
        }),
    }
);
