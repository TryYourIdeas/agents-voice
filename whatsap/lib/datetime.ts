// Date/time helpers shared by the get_current_datetime tool, the datetime
// middleware (which stamps every model call) and the scheduler's recurring
// prompt. The agent has no clock of its own, so without these it anchors on
// whatever dates appear in its notes/memory and re-researches stale topics
// (see docs/learnings for the AI-news search loop).

// Timezone the agent reports by default: AGENT_TIMEZONE, then the process TZ,
// then the runtime's own zone, then UTC. Invalid values are skipped.
export function agentTimezone(): string {
    const candidates = [process.env.AGENT_TIMEZONE, process.env.TZ, Intl.DateTimeFormat().resolvedOptions().timeZone];
    return candidates.find((tz): tz is string => !!tz && isValidTimezone(tz)) ?? "UTC";
}

export function isValidTimezone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

export interface NowDescription {
    iso: string; // UTC instant, ISO 8601
    timeZone: string;
    date: string; // YYYY-MM-DD in timeZone
    time: string; // HH:mm:ss in timeZone
    weekday: string;
    offset: string; // e.g. UTC-03:00
    text: string; // one-line human/LLM readable summary
}

export function describeNow(now: Date = new Date(), timeZone: string = agentTimezone()): NowDescription {
    if (!isValidTimezone(timeZone)) throw new Error(`Invalid timezone '${timeZone}'`);
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            weekday: "long",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "longOffset",
        })
            .formatToParts(now)
            .map((p) => [p.type, p.value])
    );
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}:${parts.second}`;
    // "GMT-03:00" -> "UTC-03:00"; plain "GMT" (zero offset) -> "UTC+00:00"
    const rawOffset = String(parts.timeZoneName);
    const offset = rawOffset === "GMT" ? "UTC+00:00" : rawOffset.replace("GMT", "UTC");
    return {
        iso: now.toISOString(),
        timeZone,
        date,
        time,
        weekday: parts.weekday,
        offset,
        text: `${parts.weekday}, ${date} ${time} (${timeZone}, ${offset}); UTC ${now.toISOString()}`,
    };
}
