import { tool } from "langchain";
import { z } from "zod";
import { describeNow, agentTimezone, isValidTimezone } from "../lib/datetime.ts";

export const getCurrentDatetimeTool = tool(
    async ({ timezone }) => {
        const tz = timezone ?? agentTimezone();
        if (!isValidTimezone(tz)) {
            return `Invalid timezone '${tz}'. Use an IANA name such as 'America/Sao_Paulo', 'Europe/Madrid' or 'UTC'.`;
        }
        const now = describeNow(new Date(), tz);
        return JSON.stringify(
            { date: now.date, time: now.time, weekday: now.weekday, timezone: now.timeZone, utcOffset: now.offset, isoUtc: now.iso },
            null,
            2
        );
    },
    {
        name: "get_current_datetime",
        description:
            "Get the current date, time, weekday and timezone. Use it whenever the answer depends on 'now': " +
            "'today', 'this week', 'latest news', deadlines, scheduling, file names containing a date, or " +
            "deciding whether information you remember is stale. Your own sense of the date is unreliable — " +
            "notes and memory files may mention older dates. Optionally pass an IANA timezone to get the time " +
            "somewhere else; by default it uses the agent's configured timezone.",
        schema: z.object({
            timezone: z
                .string()
                .optional()
                .describe("Optional IANA timezone name, e.g. 'America/Sao_Paulo'. Defaults to the agent's timezone."),
        }),
    }
);
