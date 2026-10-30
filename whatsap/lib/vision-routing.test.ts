import { describe, it, expect, vi } from "vitest";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { lastHumanHasImage, stripImages, routeModelCall } from "./vision-routing.ts";

const img = { type: "image", mimeType: "image/jpeg", data: "QUJD" };
const withImage = (text = "what is this?") => new HumanMessage({ content: [{ type: "text", text }, img] });

describe("lastHumanHasImage", () => {
    it("is true when the latest human message carries an image", () => {
        expect(lastHumanHasImage([new HumanMessage("hi"), new AIMessage("yo"), withImage()])).toBe(true);
    });

    it("stays true while the agent is mid tool-loop on an image turn", () => {
        expect(lastHumanHasImage([withImage(), new AIMessage("calling"), new ToolMessage({ content: "ok", tool_call_id: "1" })])).toBe(true);
    });

    it("is false once a later text-only turn arrives", () => {
        expect(lastHumanHasImage([withImage(), new AIMessage("a cat"), new HumanMessage("and its colour?")])).toBe(false);
    });

    it("is false for plain text and empty history", () => {
        expect(lastHumanHasImage([new HumanMessage("hello")])).toBe(false);
        expect(lastHumanHasImage([])).toBe(false);
    });
});

describe("stripImages", () => {
    it("replaces image blocks with a text placeholder and leaves other messages alone", () => {
        const plain = new HumanMessage("hello");
        const [a, b] = stripImages([withImage("describe"), plain]);
        expect(a.content).toEqual([{ type: "text", text: "describe" }, { type: "text", text: "[image omitted]" }]);
        expect(b).toBe(plain);
    });

    it("returns the same array when there is nothing to strip", () => {
        const msgs = [new HumanMessage("hello")];
        expect(stripImages(msgs)).toBe(msgs);
    });
});

describe("routeModelCall", () => {
    const textModel = { name: "text" } as any;
    const visionModel = { name: "vision" } as any;

    it("sends image turns to the vision model with messages untouched", async () => {
        const handler = vi.fn(async (r: any) => r);
        const messages = [withImage()];
        await routeModelCall({ model: textModel, messages }, handler, visionModel);
        expect(handler.mock.calls[0][0].model).toBe(visionModel);
        expect(handler.mock.calls[0][0].messages).toBe(messages);
    });

    it("keeps text turns on the text model and strips older images from history", async () => {
        const handler = vi.fn(async (r: any) => r);
        await routeModelCall({ model: textModel, messages: [withImage(), new AIMessage("a cat"), new HumanMessage("colour?")] }, handler, visionModel);
        const sent = handler.mock.calls[0][0];
        expect(sent.model).toBe(textModel);
        expect(JSON.stringify(sent.messages[0].content)).not.toContain("QUJD");
    });

    it("is a pass-through when no vision model is configured", async () => {
        const handler = vi.fn(async (r: any) => r);
        const request = { model: textModel, messages: [withImage()] };
        await routeModelCall(request, handler, undefined);
        expect(handler).toHaveBeenCalledWith(request);
    });
});
