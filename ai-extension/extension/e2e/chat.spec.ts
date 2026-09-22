// Loads the built extension (run `npm run build` first) into a persistent
// Chromium context, opens the side panel, and drives a chat turn end to end
// against a real ai-extension/server instance running on localhost:4100.
import { test, expect, chromium } from "@playwright/test";
import path from "node:path";

const EXTENSION_PATH = path.resolve(import.meta.dirname, "dist");

test("side panel chat: send a message and see a reply", async () => {
    const context = await chromium.launchPersistentContext("", {
        headless: false,
        args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });

    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    const extensionId = background.url().split("/")[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

    await page.getByRole("textbox", { name: /message/i }).fill("Say hello");
    await page.getByRole("button", { name: /send/i }).click();

    await expect(page.getByText("Say hello")).toBeVisible();
    await expect(page.locator("li")).toHaveCount(2, { timeout: 15_000 });

    await context.close();
});

test("side panel chat: attach page selection as context", async () => {
    const context = await chromium.launchPersistentContext("", {
        headless: false,
        args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });

    const targetPage = await context.newPage();
    await targetPage.setContent("<p id='target'>This is the article text to critique.</p>");
    await targetPage.locator("#target").selectText();

    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent("serviceworker");
    const extensionId = background.url().split("/")[2];

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await panel.getByRole("button", { name: /use selection/i }).click();

    await expect(panel.getByText(/article text to critique/i)).toBeVisible();

    await context.close();
});
