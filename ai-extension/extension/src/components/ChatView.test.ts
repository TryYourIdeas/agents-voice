import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/vue";
import ChatView from "./ChatView.vue";

vi.mock("../composables/usePageContext.ts", () => ({
    grabSelection: vi.fn(async () => ({ type: "selection", text: "sel text", url: "https://example.com" })),
    grabPageText: vi.fn(async () => ({ type: "page", text: "page text", url: "https://example.com" })),
}));

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => ({ reply: "agent reply" }) }))
    );
});

describe("ChatView", () => {
    it("has an accessible message input and send button", () => {
        render(ChatView);
        expect(screen.getByRole("textbox", { name: /message/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    });

    it("sends a message on submit and renders the reply", async () => {
        render(ChatView);
        const input = screen.getByRole("textbox", { name: /message/i });
        await fireEvent.update(input, "hello");
        await fireEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(await screen.findByText("agent reply")).toBeInTheDocument();
        expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("attaches selection context as a dismissible chip", async () => {
        render(ChatView);
        await fireEvent.click(screen.getByRole("button", { name: /use selection/i }));

        const chip = await screen.findByText(/sel text/i);
        expect(chip).toBeInTheDocument();

        await fireEvent.click(screen.getByRole("button", { name: /remove attached context/i }));
        expect(screen.queryByText(/sel text/i)).not.toBeInTheDocument();
    });

    it("shows a visible error when grabbing page context fails", async () => {
        const { grabPageText } = await import("../composables/usePageContext.ts");
        vi.mocked(grabPageText).mockRejectedValueOnce(new Error("Cannot access contents of the page"));

        render(ChatView);
        await fireEvent.click(screen.getByRole("button", { name: /use page/i }));

        expect(await screen.findByText(/cannot access contents of the page/i)).toBeInTheDocument();
    });

    it("shows a visible error when grabbing selection context fails", async () => {
        const { grabSelection } = await import("../composables/usePageContext.ts");
        vi.mocked(grabSelection).mockRejectedValueOnce(new Error("No active tab found"));

        render(ChatView);
        await fireEvent.click(screen.getByRole("button", { name: /use selection/i }));

        expect(await screen.findByText(/no active tab found/i)).toBeInTheDocument();
    });
});
