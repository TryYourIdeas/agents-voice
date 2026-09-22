// Makes the toolbar icon open the side panel directly (the default MV3
// behavior requires an explicit opt-in via setPanelBehavior).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error("[ai-extension] failed to set side panel behavior:", error);
});
