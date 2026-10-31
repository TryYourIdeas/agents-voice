import { describe, it, expect, afterEach } from "vitest";
import { getCurrentDatetimeTool } from "./get-current-datetime.tool.ts";

afterEach(() => {
    delete process.env.AGENT_TIMEZONE;
});

describe("get_current_datetime tool", () => {
    it("returns date, time, weekday and the configured timezone", async () => {
        process.env.AGENT_TIMEZONE = "America/Sao_Paulo";
        const out = JSON.parse(await getCurrentDatetimeTool.invoke({}));
        expect(out.timezone).toBe("America/Sao_Paulo");
        expect(out.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(out.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(out.utcOffset).toBe("UTC-03:00");
        expect(out.weekday).toBeTruthy();
    });

    it("honours an explicit timezone argument", async () => {
        const out = JSON.parse(await getCurrentDatetimeTool.invoke({ timezone: "UTC" }));
        expect(out.timezone).toBe("UTC");
        expect(out.utcOffset).toBe("UTC+00:00");
    });

    it("explains an invalid timezone instead of throwing", async () => {
        expect(await getCurrentDatetimeTool.invoke({ timezone: "Mars/Olympus" })).toMatch(/Invalid timezone/);
    });
});
