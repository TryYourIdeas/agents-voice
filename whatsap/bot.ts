// bot.ts
//
// Per-device WhatsApp client + message handling — extracted from index.ts
// so multiple devices can each get their own Client instance sharing the
// same agent/tool/scheduler backend (see
// docs/superpowers/specs/2026-09-08-multi-device-support-design.md).

import whatsapp from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import fs from 'fs'
import path from 'path'

import { callAgent, callNamedAgent, listAvailableAgents, clearSession } from './agent.ts'
import { sendAgentResponse } from './lib/send-agent-response.ts'
import { archiveTask, tasksDir } from './lib/tasks.ts'
import { setWhatsAppClient } from './lib/whatsapp-client.ts'
import { setDeviceStatus } from './lib/device-status.ts'
import type { DeviceConfig } from './lib/devices.ts'

const { Client, LocalAuth } = whatsapp

const STT_URL = process.env.STT_URL || 'http://localhost:8001';

// Chats whose voice notes get transcribed and forwarded to the default agent
// automatically, without needing an "@ai" prefix (voice notes have no text
// body to prefix). Matched against the chat's display name, as shown by
// "@ai list channels". Shared across every device via one env var — if a
// later need arises for per-device STT allowlists, this can move into
// device.md, but nothing in this project's usage needs that distinction yet.
const STT_ALLOWED_CHATS: string[] = process.env.STT_ALLOWED_CHATS
    ? process.env.STT_ALLOWED_CHATS.split(',').map((name) => name.trim()).filter(Boolean)
    : ['@jlabrada71'];

async function getChatNameById(client: any, chatId: string): Promise<string | undefined> {
    // Not using client.getChatById()/message.getChat() here: for self-chat
    // messages (fromMe with no reliable `.to`), whatsapp-web.js's internal
    // _getChatId() can resolve to an invalid id and throw deep inside its
    // page-injected code (same class of fragile internal-Store failure as
    // the getChats() bug worked around in "list channels" below). chatId
    // is always reliably populated here, so read the name directly off the
    // chat store instead.
    return client.pupPage!.evaluate((id: string) => {
        // @ts-ignore - window.require is whatsapp-web.js's own webpack module
        // loader, injected into the page, not typed. whatsapp-web.js@1.34.7
        // dropped the global window.Store shim these bypasses used to rely
        // on — window.require('WAWebCollections')/('WAWebWidFactory') is
        // the modern equivalent, matching how the library's own built-in
        // methods (e.g. GroupChat.js, Contact.js) access the same data.
        const chat = window.require('WAWebCollections').Chat.get(window.require('WAWebWidFactory').createWid(id));
        return chat ? (chat.formattedTitle || chat.name) : undefined;
    }, chatId);
}

async function downloadAudioMedia(client: any, message: any): Promise<{ data: string; mimetype: string } | undefined> {
    // Not using message.downloadMedia() here: it re-fetches the message from
    // WhatsApp Web's internal IndexedDB store by id before decrypting, and
    // that lookup throws ("DataError: ... No key or key range specified")
    // for this self-chat's @lid-addressed messages — the same class of
    // fragile internal-Store failure worked around elsewhere in this file.
    // message.rawData (aka message._data) already has every field the
    // decrypt step needs, snapshotted client-side when the event fired, so
    // skip the re-fetch and decrypt directly from that.
    const raw = message.rawData;
    const result = await client.pupPage!.evaluate(async (raw: any) => {
        try {
            const mockQpl = {
                addAnnotations() { return this; },
                addPoint() { return this; },
            };
            // @ts-ignore - window.require/WWebJS are injected by whatsapp-web.js, not typed
            const decrypted = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
                directPath: raw.directPath,
                encFilehash: raw.encFilehash,
                filehash: raw.filehash,
                mediaKey: raw.mediaKey,
                mediaKeyTimestamp: raw.mediaKeyTimestamp,
                type: raw.type,
                signal: (new AbortController()).signal,
                downloadQpl: mockQpl,
            });
            // @ts-ignore
            const data = await window.WWebJS.arrayBufferToBase64Async(decrypted);
            return { data, mimetype: raw.mimetype };
        } catch (e: any) {
            return { __error: e?.message || String(e) };
        }
    }, raw);

    if (!result || '__error' in result) {
        console.error('[debug] downloadAudioMedia failed:', (result as any)?.__error);
        return undefined;
    }
    return result as { data: string; mimetype: string };
}

async function transcribeAudio(media: { data: string; mimetype: string }): Promise<string> {
    const audioBuffer = Buffer.from(media.data, 'base64');
    const form = new FormData();
    form.append('audio', new Blob([audioBuffer], { type: media.mimetype || 'application/octet-stream' }), 'audio');

    const res = await fetch(`${STT_URL}/stt`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`STT request failed: ${res.status} ${await res.text()}`);
    }
    const { text } = await res.json() as { text: string };
    return text;
}

// Per-device raw-event log (was a single shared logs.txt before devices
// existed) — same append-only JSON-dump behavior, just scoped under this
// device's own directory.
function logToFile(deviceName: string, data: unknown) {
    const logFilePath = path.join('devices', deviceName, 'logs.txt');
    fs.appendFile(logFilePath, JSON.stringify(data, null, 2), (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

export function createDeviceBot(device: DeviceConfig): any {
    const deviceName = device.name;

    const client = new Client({
        authStrategy: new LocalAuth({
            // Must be absolute: Puppeteer/Chromium resolve a relative
            // userDataDir against their own internal cwd, which isn't
            // guaranteed to match Node's process.cwd() — the original
            // single-device code always used an absolute path here, and
            // this refactor initially (incorrectly) dropped it, causing a
            // real, reproducible stuck-after-authenticated hang.
            dataPath: path.join(process.cwd(), 'devices', deviceName, 'session'),
            clientId: deviceName,
        }),
        puppeteer: {
            // Chromium has no usable sandbox when running as root in a container.
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // Default (30s) was too tight once a second device's Chromium
            // launches concurrently and competes for CPU during init —
            // hit a real "Runtime.callFunctionOn timed out" ProtocolError
            // from Client.inject() during a second device's initialize().
            protocolTimeout: 120000,
        },
    });

    // Makes this client reachable from tools/get-current-chat.tool.ts and
    // scheduler.ts, both of which are set up before this client exists.
    setWhatsAppClient(deviceName, client);

    client.on('ready', () => {
        console.log(`[${deviceName}] Client is ready!`);
        setDeviceStatus(deviceName, { state: 'connected' });
    });

    client.on('qr', (qr) => {
        // Terminal QR output stays as a fallback alongside the web UI
        // (devices-ui) — harmless to keep printing, and useful if the UI
        // container isn't up for some reason. Prefixed with the device
        // name so multiple devices' output stays attributable.
        console.log(`[${deviceName}] scan this QR code:`);
        qrcode.generate(qr, { small: true });
        setDeviceStatus(deviceName, { state: 'pending', qr });
    });

    // Visibility into the connection lifecycle beyond just 'qr'/'ready' —
    // useful for diagnosing a stuck or dropped session without needing to
    // patch in diagnostics again.
    client.on('loading_screen', (percent, message) => {
        console.log(`[${deviceName}] [diag] loading_screen:`, percent, message);
    });
    client.on('change_state', (state) => {
        console.log(`[${deviceName}] [diag] change_state:`, state);
    });
    client.on('authenticated', () => {
        console.log(`[${deviceName}] [diag] authenticated`);
    });
    client.on('auth_failure', (msg) => {
        console.log(`[${deviceName}] [diag] auth_failure:`, msg);
    });
    client.on('disconnected', (reason) => {
        console.log(`[${deviceName}] [diag] disconnected:`, reason);
        setDeviceStatus(deviceName, { state: 'disconnected' });
    });

    const debug = true;
    const MESSAGE = debug ? 'message_create' : 'message';

    client.on(MESSAGE, async (message: any) => {
        logToFile(deviceName, '---- message event ----');
        logToFile(deviceName, message);
        console.log(`[${deviceName}] ---- message-create event ----`);
        console.log(`[${deviceName}] [debug] body:`, JSON.stringify(message.body), 'from:', message.from);

        // WhatsApp's own convention: the chat this message belongs to is `.to`
        // when the account sent it (fromMe), `.from` otherwise — e.g. for a
        // self-chat message, `.from` is the account's legacy phone-based id but
        // `.to` is its modern @lid chat id, and only the latter actually
        // resolves in the chat store or reliably keys conversation memory
        // across a self-chat session. Computed once here and used for every
        // send target / thread id below, instead of raw message.from.
        const chatId = message.fromMe ? message.to : message.from;

        if (message.body === '!ping') {
            // send back "pong" to the chat the message was sent in
            client.sendMessage(chatId, 'pong');
            // reply back "pong" directly to the message
            message.reply('pong');
        }

        if (message.hasMedia && (message.type === 'ptt' || message.type === 'audio')) {
            try {
                const chatName = await getChatNameById(client, chatId);
                if (chatName && STT_ALLOWED_CHATS.includes(chatName)) {
                    console.log(`[${deviceName}] [debug] audio message received in '${chatName}' (stt-allowed), transcribing...`);
                    const media = await downloadAudioMedia(client, message);
                    if (!media) {
                        await message.reply('Sorry, I could not download that audio.');
                    } else {
                        const transcript = await transcribeAudio(media);
                        console.log(`[${deviceName}] [debug] transcript:`, transcript);
                        const response = await callAgent(deviceName, transcript, chatId);
                        console.log(`[${deviceName}] [debug] agent response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    }
                }
            } catch (err) {
                console.error(`[${deviceName}] [debug] audio-to-agent flow failed:`, err);
                await message.reply('Sorry, something went wrong transcribing that audio.');
            }
        }

        if (message.body.startsWith('@ai')) {
            const request = message.body.replace('@ai', '').trim();
            console.log(`[${deviceName}] [debug] @ai request received:`, request);

            if (request.toLowerCase() === 'help') {
                await message.reply(
                    'Available commands:\n' +
                    '!ping — health check, replies pong\n' +
                    '@ai help — show this list\n' +
                    '@ai list agents — list available named agents (./agents/*)\n' +
                    '@ai @agent <agent name> [message] — talk to a named agent\n' +
                    '@ai clear session — start fresh, forgetting this chat\'s conversation with every agent\n' +
                    '@ai schedule <describe task and timing> — create a scheduled task (one-off or recurring)\n' +
                    '@ai list tasks — list active scheduled tasks\n' +
                    '@ai cancel task <name> — cancel a scheduled task\n' +
                    '@ai <message> — talk to the default agent\n' +
                    `Voice notes sent to: ${STT_ALLOWED_CHATS.join(', ')} — auto-transcribed and forwarded to the default agent`
                );
            } else if (request.toLowerCase() === 'clear session') {
                try {
                    await clearSession(deviceName, chatId);
                    await message.reply('Session cleared — starting fresh with every agent in this chat.');
                } catch (err) {
                    console.error(`[${deviceName}] [debug] clear session failed:`, err);
                    await message.reply('Sorry, something went wrong clearing the session.');
                }
            } else if (request.toLowerCase() === 'list channels') {
                try {
                    // Not using client.getChats() here: it fetches full live group
                    // metadata for every group chat in one Promise.all with no
                    // per-chat error handling, so a single failing group (rate
                    // limit, stale metadata, etc.) throws and kills the whole
                    // list. We only need names, so read them directly off the
                    // chat store instead.
                    const names: string[] = await client.pupPage!.evaluate(() => {
                        // @ts-ignore - window.require is whatsapp-web.js's own webpack
                        // module loader, injected into the page, not typed — see
                        // getChatNameById's comment above for why this replaced
                        // window.Store as of whatsapp-web.js@1.34.7.
                        return window.require('WAWebCollections').Chat.getModelsArray().map((chat: any) =>
                            chat.isGroup ? `${chat.formattedTitle || chat.name} (group)` : (chat.formattedTitle || chat.name || chat.id.user)
                        );
                    });
                    await message.reply(names.length > 0 ? `Available channels:\n${names.join('\n')}` : 'No channels found.');
                } catch (err) {
                    console.error(`[${deviceName}] [debug] list channels failed:`, err);
                    await message.reply('Sorry, something went wrong listing channels.');
                }
            } else if (request.toLowerCase() === 'list agents') {
                const agents = listAvailableAgents();
                await message.reply(agents.length > 0 ? `Available agents:\n${agents.join('\n')}` : 'No agents found.');
            } else if (request.toLowerCase() === 'list tasks') {
                try {
                    const indexPath = path.join(tasksDir(deviceName), 'index.md');
                    const content = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : 'No scheduled tasks yet.';
                    await message.reply(content);
                } catch (err) {
                    console.error(`[${deviceName}] [debug] list tasks failed:`, err);
                    await message.reply('Sorry, something went wrong listing tasks.');
                }
            } else if (/^cancel task\b/i.test(request)) {
                const cancelMatch = request.match(/^cancel task\s+(\S+)/i);
                const taskName = cancelMatch?.[1];
                if (!taskName) {
                    await message.reply('Usage: @ai cancel task <name>');
                } else {
                    try {
                        archiveTask(deviceName, taskName, 'cancelled via @ai cancel task');
                        await message.reply(`Task '${taskName}' cancelled and archived.`);
                    } catch (err) {
                        console.error(`[${deviceName}] [debug] cancel task '${taskName}' failed:`, err);
                        await message.reply(`Could not cancel task '${taskName}': ${(err as any)?.message || 'not found'}`);
                    }
                }
            } else if (/^schedule\b/i.test(request)) {
                const scheduleText = request.replace(/^schedule\s*/i, '').trim();
                if (!scheduleText) {
                    await message.reply('Usage: @ai schedule <describe the task and when it should run>');
                } else {
                    try {
                        // task-scheduler resolves "this chat"/"current chat" itself
                        // via the get_current_chat tool — no need to inject a
                        // context hint here.
                        const response = await callNamedAgent(deviceName, 'task-scheduler', scheduleText, chatId);
                        console.log(`[${deviceName}] [debug] task-scheduler response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    } catch (err) {
                        console.error(`[${deviceName}] [debug] schedule command failed:`, err);
                        await message.reply('Sorry, something went wrong creating that scheduled task.');
                    }
                }
            } else if (/^@agent\b/i.test(request)) {
                // "@ai @agent <agent name> <message>" routes to the named agent's
                // own system prompt from ./agents/<agent name>/agent.md instead
                // of the default one in prompts/executer-system.md.
                const agentMatch = request.match(/^@agent\s+(\S+)\s*([\s\S]*)$/i);
                const agentName = agentMatch?.[1];
                const agentMessage = agentMatch?.[2]?.trim();

                if (!agentName) {
                    await message.reply('Usage: @ai @agent <agent name> [message]');
                } else {
                    try {
                        const response = await callNamedAgent(deviceName, agentName, agentMessage || 'Hi', chatId);
                        console.log(`[${deviceName}] [debug] named agent response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    } catch (err) {
                        console.error(`[${deviceName}] [debug] callNamedAgent('${agentName}') failed:`, err);
                        const available = listAvailableAgents();
                        await message.reply(
                            available.length > 0
                                ? `Agent '${agentName}' not found. Available agents: ${available.join(', ')}`
                                : `Agent '${agentName}' not found, and no agents are configured under ./agents.`
                        );
                    }
                }
            } else {
                try {
                    const response = await callAgent(deviceName, request, chatId);
                    console.log(`[${deviceName}] [debug] agent response:`, response);
                    await sendAgentResponse(client, chatId, response);
                } catch (err) {
                    console.error(`[${deviceName}] [debug] callAgent failed:`, err);
                    await message.reply('Sorry, something went wrong processing that request.');
                }
            }
        }

        if (message.notifyName === 'Diego Cobian') {
            console.log(`[${deviceName}] ---- message from Diego Cobian ----`);
            console.log(message.body);
        }
    });

    // Never left un-awaited/uncaught: an initialize() rejection (e.g. a
    // puppeteer protocolTimeout) becomes an unhandled promise rejection,
    // which is fatal to the whole Node process by default (Node 15+) —
    // that would take every other device down too, not just this one.
    client.initialize().catch((err: unknown) => {
        console.error(`[${deviceName}] client.initialize() failed:`, err);
        setDeviceStatus(deviceName, { state: 'disconnected' });
    });
    return client;
}
