import { describe, it, expect, afterEach } from "vitest";
import { datetimeAddendum } from "./datetime-middleware.ts";

afterEach(() => {
    delete process.env.AGENT_TIMEZONE;
});

describe("datetimeAddendum", () => {
    it("states today's date, minute-precision time and timezone", () => {
        process.env.AGENT_TIMEZONE = "America/Sao_Paulo";
        const text = datetimeAddendum(new Date("2026-10-31T12:54:28Z"));
        expect(text).toContain("Saturday, 2026-10-31 09:54");
        expect(text).toContain("America/Sao_Paulo");
        expect(text).toContain("Today's date is 2026-10-31");
        expect(text).not.toContain("09:54:28");
    });
});
