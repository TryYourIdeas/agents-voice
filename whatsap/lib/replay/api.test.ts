import { describe, it, expect } from "vitest";
import { handleReplayRequest } from "./api.ts";
import { ReplayError } from "./run.ts";

describe("handleReplayRequest", () => {
    it("returns 202 with the replay turn id", async () => {
        const r = await handleReplayRequest(JSON.stringify({ turnId: 3, modelConfigId: 1 }), async () => ({ replayTurnId: 9, done: Promise.resolve() }));
        expect(r).toEqual({ status: 202, body: { replayTurnId: 9 } });
    });
    it("400 for invalid JSON or ids", async () => {
        const start = async () => ({ replayTurnId: 1, done: Promise.resolve() });
        expect((await handleReplayRequest("{nope", start)).status).toBe(400);
        expect((await handleReplayRequest(JSON.stringify({ turnId: "x" }), start)).status).toBe(400);
    });
    it("passes ReplayError status through, other errors become 500 without details", async () => {
        const nf = await handleReplayRequest(JSON.stringify({ turnId: 3, modelConfigId: 1 }), async () => { throw new ReplayError("Turn 3 not found", 404); });
        expect(nf).toEqual({ status: 404, body: { error: "Turn 3 not found" } });
        const boom = await handleReplayRequest(JSON.stringify({ turnId: 3, modelConfigId: 1 }), async () => { throw new Error("secret detail"); });
        expect(boom.status).toBe(500);
        expect(JSON.stringify(boom.body)).not.toContain("secret");
    });
});
