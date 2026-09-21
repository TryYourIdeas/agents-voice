import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
    manifest_version: 3,
    name: "AI Page Assistant",
    version: "1.0.0",
    description: "Chat with an AI agent about the page you're browsing.",
    // Pins the extension's ID across rebuilds (chrome-extension://<id from this key>),
    // so ai-extension/server's EXTENSION_ID CORS allow-list doesn't change on every
    // `npm run build`. This is a project-wide dev key (not a secret — Chrome derives
    // the ID from this public key alone; no private key is needed anywhere in this
    // repo). Its corresponding extension ID is
    // kbemgcmgfjcmpfhfcpfgfpanaommfgco — see docs/user-guides/config.md. To use your
    // own instead: `openssl genrsa -out k.pem 2048 && openssl rsa -in k.pem -pubout
    // -outform DER | base64 -w0`.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAslSv2y80t0nnCZBuRw/sbXZImSQRyHo3n88c+1sI2k88AS7oCngXhvJbl6LRU7u5RQKPUDLKZG4ZVzTkvmgimR7FceXOVzeVo+7FBEc/IQgJFfziWBoRlE27akl52L1NUe99QsrtCqhYMSp/ixg14UpzqzRc3XPTGxQ2oanTPlpIstnGl2SAl8siA1CilgZDIUulz7Zs6629hzFOCsR8R+paUZFRQNdx1Nc+M+npxLnyMhrh+Md9ig6WxwbJVliHRSXyJPY7T7CGEYSqw7XsezCmuzFWMdwuyTKTSIRaYSUVX9S/ecMhfjiwtiY8l1YKlJzXPynb5ymCMiD2SP2/yQIDAQAB",
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
