// lib/replay/api.ts — request handling of POST /api/replay (kept apart from internal-api.ts so it can be tested).

import { startReplay, ReplayError } from "./run.ts";

export type StartFn = (args: { originalTurnId: number; modelConfigId: number }) => Promise<{ replayTurnId: number }>;

export async function handleReplayRequest(rawBody: string, start: StartFn = startReplay): Promise<{ status: number; body: Record<string, unknown> }> {
    let parsed: any;
    try {
        parsed = JSON.parse(rawBody);
    } catch {
        return { status: 400, body: { error: "Invalid JSON body." } };
    }
    const turnId = Number(parsed?.turnId);
    const modelConfigId = Number(parsed?.modelConfigId);
    if (!Number.isInteger(turnId) || turnId < 1 || !Number.isInteger(modelConfigId) || modelConfigId < 1) {
        return { status: 400, body: { error: "turnId and modelConfigId must be positive integers." } };
    }
    try {
        const { replayTurnId } = await start({ originalTurnId: turnId, modelConfigId });
        return { status: 202, body: { replayTurnId } };
    } catch (e: any) {
        if (e instanceof ReplayError) return { status: e.status, body: { error: e.message } };
        console.error("[replay] could not start:", e?.message ?? e);
        return { status: 500, body: { error: "Could not start the replay." } };
    }
}
