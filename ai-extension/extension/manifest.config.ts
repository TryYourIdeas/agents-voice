import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
    manifest_version: 3,
    name: "AI Page Assistant",
    version: "1.0.0",
    description: "Chat with an AI agent about the page you're browsing.",
    // Pins the extension's ID across rebuilds (chrome-extension://<id from this key>),
    // so ai-extension/server's EXTENSION_ID CORS allow-list doesn't change on every
    // `npm run build`. Generate your own with `openssl genrsa 2048 | openssl rsa -pubout`
    // and base64-encode the DER public key — see docs/user-guides/config.md.
    key: "REPLACE_WITH_YOUR_OWN_PUBLIC_KEY",
    permissions: ["sidePanel", "activeTab", "scripting", "storage"],
    background: {
        service_worker: "src/background/service-worker.ts",
        type: "module",
    },
    side_panel: {
        default_path: "src/sidepanel/index.html",
    },
    action: {},
});
