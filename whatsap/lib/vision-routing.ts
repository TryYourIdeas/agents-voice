// lib/vision-routing.ts
//
// Two local models: a small text model (LFM3-1.7B) for everything, and a
// vision model (LFM3-VL-2B) used only for turns that carry images (photos,
// quoted images, video frames). llama-server serves one model per process, so
// they are two servers; the app picks per model call (see
// docs/user-guides/config.md, "Text and vision models").
//
// Routing is by the *latest human message*: it stays on the vision model for the
// whole tool loop of an image turn, and goes back to the text model on the next
// text-only turn. Images left in older history are replaced by a placeholder
// for the text model, which can't read them.

import { createMiddleware } from "langchain";
import { HumanMessage } from "@langchain/core/messages";

const isImageBlock = (b: any): boolean => b?.type === "image" || b?.type === "image_url";
const hasImageBlock = (content: unknown): boolean => Array.isArray(content) && content.some(isImageBlock);

function kindOf(m: any): string | undefined {
    return typeof m?.getType === "function" ? m.getType() : m?._getType?.();
}

export function lastHumanHasImage(messages: any[]): boolean {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (kindOf(messages[i]) === "human") return hasImageBlock(messages[i].content);
    }
    return false;
}

export function stripImages(messages: any[]): any[] {
    if (!messages.some((m) => hasImageBlock(m?.content))) return messages;
    return messages.map((m) =>
        hasImageBlock(m?.content)
            ? new HumanMessage({
                  id: m.id,
                  content: m.content.map((b: any) => (isImageBlock(b) ? { type: "text", text: "[image omitted]" } : b)),
              })
            : m,
    );
}

type ModelRequest = { model: any; messages: any[]; [k: string]: any };

export async function routeModelCall(request: ModelRequest, handler: (r: any) => Promise<any>, visionModel: any | undefined) {
    if (!visionModel) return handler(request);
    if (lastHumanHasImage(request.messages)) {
        if (process.env.NUXT_ADD_DEBUG_LOGS === "true") console.log("[debug] vision-routing: image turn -> vision model");
        return handler({ ...request, model: visionModel });
    }
    return handler({ ...request, messages: stripImages(request.messages) });
}

export function createVisionRoutingMiddleware(visionModel: any | undefined) {
    return createMiddleware({
        name: "visionRouting",
        wrapModelCall: (request, handler) => routeModelCall(request as ModelRequest, handler as any, visionModel),
    });
}
