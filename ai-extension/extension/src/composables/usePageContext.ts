export interface PageContext {
    type: "selection" | "page";
    text: string;
    url: string;
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        throw new Error("No active tab found");
    }
    return tab;
}

async function extractFromActiveTab(type: PageContext["type"], func: () => string): Promise<PageContext> {
    const tab = await getActiveTab();
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func,
    });
    return { type, text: result ?? "", url: tab.url ?? "" };
}

export function grabSelection(): Promise<PageContext> {
    return extractFromActiveTab("selection", () => window.getSelection()?.toString() ?? "");
}

export function grabPageText(): Promise<PageContext> {
    return extractFromActiveTab("page", () => document.body.innerText);
}
