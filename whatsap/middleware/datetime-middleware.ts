import { createMiddleware } from "langchain";
import { describeNow } from "../lib/datetime.ts";

// Stamps every model call with the current date/time/timezone so the agent
// never has to guess "today". Minute precision (not seconds) keeps the system
// prompt stable between rapid tool-call rounds. The get_current_datetime tool
// is there for exact values and other timezones.
export function datetimeAddendum(now: Date = new Date()): string {
    const d = describeNow(now);
    return (
        `\n\n## Current date and time\n\n` +
        `Right now it is ${d.weekday}, ${d.date} ${d.time.slice(0, 5)} (${d.timeZone}, ${d.offset}). ` +
        `Today's date is ${d.date}. Treat this as the source of truth for "today", "latest" and "recent": ` +
        `dates in memory files, notes or earlier search results may be old. ` +
        `Call get_current_datetime for exact seconds or another timezone.`
    );
}

export const datetimeMiddleware = createMiddleware({
    name: "datetimeMiddleware",
    wrapModelCall: async (request, handler) =>
        handler({ ...request, systemMessage: request.systemMessage.concat(datetimeAddendum()) }),
});
