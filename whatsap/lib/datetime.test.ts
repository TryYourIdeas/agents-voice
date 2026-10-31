import { describe, it, expect, afterEach } from "vitest";
import { describeNow, agentTimezone, isValidTimezone } from "./datetime.ts";

const instant = new Date("2026-10-31T12:54:28Z");

afterEach(() => {
    delete process.env.AGENT_TIMEZONE;
});

describe("describeNow", () => {
    it("formats the instant in the requested timezone", () => {
        const d = describeNow(instant, "America/Sao_Paulo");
        expect(d).toMatchObject({ date: "2026-10-31", time: "09:54:28", weekday: "Saturday", offset: "UTC-03:00", timeZone: "America/Sao_Paulo" });
        expect(d.iso).toBe("2026-10-31T12:54:28.000Z");
    });

    it("rolls the date over across timezones", () => {
        expect(describeNow(instant, "Pacific/Auckland").date).toBe("2026-11-01");
    });

    it("reports UTC with a +00:00 offset", () => {
        expect(describeNow(instant, "UTC")).toMatchObject({ time: "12:54:28", offset: "UTC+00:00" });
    });

    it("throws on an invalid timezone", () => {
        expect(() => describeNow(instant, "Mars/Olympus")).toThrow(/Invalid timezone/);
    });
});

describe("agentTimezone", () => {
    it("prefers AGENT_TIMEZONE", () => {
        process.env.AGENT_TIMEZONE = "Europe/Madrid";
        expect(agentTimezone()).toBe("Europe/Madrid");
    });
    it("ignores an invalid AGENT_TIMEZONE", () => {
        process.env.AGENT_TIMEZONE = "nope";
        expect(isValidTimezone(agentTimezone())).toBe(true);
    });
});
