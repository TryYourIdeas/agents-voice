// lib/whatsapp-client.ts
//
// Tools are built at module-load time (see shared.ts's sharedTools array),
// before any WhatsApp Client exists — and now there can be several, one per
// device (see docs/superpowers/specs/2026-09-08-multi-device-support-design.md).
// This registry lets bot.ts register each device's live client as it's
// created, and any tool/module that needs one at call time (e.g.
// tools/get-current-chat.tool.ts) read it back by device name.

const clients = new Map<string, any>();

export function setWhatsAppClient(deviceName: string, client: any): void {
    clients.set(deviceName, client);
}

export function getWhatsAppClient(deviceName: string): any {
    const client = clients.get(deviceName);
    if (!client) {
        throw new Error(`WhatsApp client for device '${deviceName}' not initialized yet.`);
    }
    return client;
}
