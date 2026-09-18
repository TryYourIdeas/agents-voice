# Agent Access to Images and Audio From Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `@ai <text>` messages that carry (or reply/quote to) an image or voice note give the default agent the actual image (vision) or transcribed audio, not just the caption.

**Architecture:** Extract the existing self-chat-safe media decrypt/download logic out of `bot.ts` into a new `lib/message-media.ts`, generalize it from audio-only to any media type, add a `resolveIncomingMedia()` that resolves both directly-attached and quoted media, widen `agent.ts`'s `callAgent` to accept LangChain's `MessageContent` (string or content-block array) instead of only a string, and wire the two together in `bot.ts`'s default `@ai` branch.

**Tech Stack:** TypeScript (Node native TS execution, no build step), `whatsapp-web.js`, `@langchain/core` / `langchain` (`ChatAnthropic`), Vitest.

Spec: `docs/superpowers/specs/2026-09-18-agent-media-from-chat-design.md`

---

## Reference: confirmed LangChain content block shapes

Verified against the installed `@langchain/core@1.2.9` types
(`node_modules/@langchain/core/dist/messages/base.d.ts` and
`.../content/multimodal.d.ts`):

```ts
type MessageContent = string | Array<ContentBlock>;

// ContentBlock.Text
{ type: "text", text: string }

// ContentBlock (Multimodal.Image)
{ type: "image", mimeType: string, data: string }   // data is base64
```

Both are exported from `@langchain/core/messages`.

---

### Task 1: Extract generic media download into `lib/message-media.ts`

Pure refactor — no behavior change. Moves `bot.ts`'s `downloadAudioMedia`
(renamed `downloadMessageMedia`, generalized off "audio") and
`transcribeAudio` into a new shared module, and updates `bot.ts`'s existing
hands-free voice-note flow to import them instead of defining them locally.

**Files:**
- Create: `lib/message-media.ts`
- Modify: `bot.ts:1-119` (imports, remove `STT_URL`/`downloadAudioMedia`/`transcribeAudio`), `bot.ts:211-231` (existing voice-note block's call site)

- [ ] **Step 1: Create `lib/message-media.ts` with the extracted functions**

```ts
// lib/message-media.ts
//
// Resolves image/audio media attached to (or quoted by) an incoming
// WhatsApp message so the agent can see images (vision) and hear audio
// (transcribed to text) — see
// docs/superpowers/specs/2026-09-18-agent-media-from-chat-design.md.

const STT_URL = process.env.STT_URL || 'http://localhost:8001';

export type DownloadedMedia = { data: string; mimetype: string };

// Not using message.downloadMedia() here: it re-fetches the message from
// WhatsApp Web's internal IndexedDB store by id before decrypting, and
// that lookup throws ("DataError: ... No key or key range specified") for
// this self-chat's @lid-addressed messages — the same class of fragile
// internal-Store failure worked around elsewhere in this codebase.
// message.rawData (aka message._data) already has every field the decrypt
// step needs, snapshotted client-side when the event fired, so skip the
// re-fetch and decrypt directly from that. Works for any media type
// (image, audio, ...), not just audio — hence taking rawData directly
// rather than a whole message, so it can be reused for quoted messages too.
export async function downloadMessageMedia(client: any, rawData: any): Promise<DownloadedMedia | undefined> {
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
    }, rawData);

    if (!result || '__error' in result) {
        console.error('[debug] downloadMessageMedia failed:', (result as any)?.__error);
        return undefined;
    }
    return result as DownloadedMedia;
}

export async function transcribeAudio(media: DownloadedMedia): Promise<string> {
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
```

- [ ] **Step 2: Update `bot.ts` to import from `lib/message-media.ts` instead of defining locally**

Remove from `bot.ts`:
- Line 22: `const STT_URL = process.env.STT_URL || 'http://localhost:8001';`
- Lines 54-94: the whole `downloadAudioMedia` function.
- Lines 96-107: the whole `transcribeAudio` function.

Add to `bot.ts`'s imports (near the top, alongside the other local imports):

```ts
import { downloadMessageMedia, transcribeAudio } from './lib/message-media.ts'
```

Update the existing hands-free voice-note block's call site (was
`bot.ts:216`, `const media = await downloadAudioMedia(client, message);`)
to pass `rawData` directly, matching the new generalized signature:

```ts
const media = await downloadMessageMedia(client, message.rawData);
```

No other line in that block changes — `transcribeAudio(media)` on the next
line is unchanged (same name, now imported instead of local).

- [ ] **Step 3: Run the test suite to confirm nothing broke**

Run: `pnpm test`
Expected: PASS (no test today exercises this code path directly — this is
confirming the refactor didn't break imports/types elsewhere, e.g.
`scheduler.test.ts` transitively importing `bot.ts`-adjacent modules).

- [ ] **Step 4: Commit**

```bash
git add lib/message-media.ts bot.ts
git commit -m "refactor: extract generic media download into lib/message-media.ts"
```

---

### Task 2: Add `resolveIncomingMedia()` with tests (TDD)

Adds the new logic that resolves both directly-attached and quoted media
into images (for vision) and transcripts (for audio), skipping — not
aborting on — any single item's failure.

**Files:**
- Modify: `lib/message-media.ts` (append)
- Test: `lib/message-media.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/message-media.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveIncomingMedia } from "./message-media.ts";

function makeClient(evaluateImpl: (fn: any, raw: any) => any) {
    return { pupPage: { evaluate: vi.fn(evaluateImpl) } };
}

function makeMessage(overrides: Partial<any> = {}) {
    return {
        hasMedia: false,
        type: undefined,
        rawData: {},
        hasQuotedMsg: false,
        getQuotedMessage: vi.fn(),
        ...overrides,
    };
}

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("lib/message-media.ts resolveIncomingMedia", () => {
    it("returns empty result when the message has no media and no quoted message", async () => {
        const client = makeClient(() => { throw new Error("should not be called"); });
        const message = makeMessage();

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("resolves a directly attached image", async () => {
        const client = makeClient(() => ({ data: "base64data", mimetype: "image/jpeg" }));
        const message = makeMessage({ hasMedia: true, type: "image", rawData: { mimetype: "image/jpeg" } });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "base64data", mimetype: "image/jpeg" }]);
        expect(result.audioTranscripts).toEqual([]);
    });

    it("resolves a directly attached voice note by transcribing it", async () => {
        const client = makeClient(() => ({ data: "base64audio", mimetype: "audio/ogg" }));
        const message = makeMessage({ hasMedia: true, type: "ptt", rawData: { mimetype: "audio/ogg" } });
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "hello from voice note" }),
        }) as any;

        const result = await resolveIncomingMedia(client, message);

        expect(result.audioTranscripts).toEqual(["hello from voice note"]);
        expect(result.images).toEqual([]);
    });

    it("resolves media on a quoted message in addition to the direct message", async () => {
        const client = makeClient((_fn: any, raw: any) =>
            raw.mimetype === "image/png"
                ? { data: "quoted-image", mimetype: "image/png" }
                : { data: "direct-audio", mimetype: "audio/ogg" }
        );
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: "direct transcript" }),
        }) as any;
        const quoted = makeMessage({ hasMedia: true, type: "image", rawData: { mimetype: "image/png" } });
        const message = makeMessage({
            hasMedia: true,
            type: "ptt",
            rawData: { mimetype: "audio/ogg" },
            hasQuotedMsg: true,
            getQuotedMessage: vi.fn().mockResolvedValue(quoted),
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "quoted-image", mimetype: "image/png" }]);
        expect(result.audioTranscripts).toEqual(["direct transcript"]);
    });

    it("ignores media of an unsupported type", async () => {
        const client = makeClient(() => { throw new Error("should not be called"); });
        const message = makeMessage({ hasMedia: true, type: "document", rawData: {} });

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("skips a media item whose download fails, without throwing", async () => {
        const client = makeClient(() => ({ __error: "boom" }));
        const message = makeMessage({ hasMedia: true, type: "image", rawData: {} });

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("skips a media item whose transcription fails, without throwing", async () => {
        const client = makeClient(() => ({ data: "base64audio", mimetype: "audio/ogg" }));
        const message = makeMessage({ hasMedia: true, type: "ptt", rawData: {} });
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "stt down" }) as any;

        const result = await resolveIncomingMedia(client, message);

        expect(result).toEqual({ images: [], audioTranscripts: [] });
    });

    it("continues resolving the quoted message even if loading it throws", async () => {
        const client = makeClient(() => ({ data: "direct-image", mimetype: "image/jpeg" }));
        const message = makeMessage({
            hasMedia: true,
            type: "image",
            rawData: { mimetype: "image/jpeg" },
            hasQuotedMsg: true,
            getQuotedMessage: vi.fn().mockRejectedValue(new Error("gone")),
        });

        const result = await resolveIncomingMedia(client, message);

        expect(result.images).toEqual([{ data: "direct-image", mimetype: "image/jpeg" }]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/message-media.test.ts`
Expected: FAIL — `resolveIncomingMedia` is not exported from
`lib/message-media.ts` yet.

- [ ] **Step 3: Implement `resolveIncomingMedia` in `lib/message-media.ts`**

Append to `lib/message-media.ts`:

```ts
export type ResolvedMedia = {
    images: DownloadedMedia[];
    audioTranscripts: string[];
};

function mediaKind(type: string): 'image' | 'audio' | undefined {
    if (type === 'image') return 'image';
    if (type === 'ptt' || type === 'audio') return 'audio';
    return undefined;
}

async function resolveOne(client: any, message: any, resolved: ResolvedMedia): Promise<void> {
    if (!message?.hasMedia) return;
    const kind = mediaKind(message.type);
    if (!kind) return;

    try {
        const media = await downloadMessageMedia(client, message.rawData);
        if (!media) return;

        if (kind === 'image') {
            resolved.images.push(media);
        } else {
            resolved.audioTranscripts.push(await transcribeAudio(media));
        }
    } catch (err) {
        console.error(`[debug] resolveIncomingMedia: failed to resolve ${kind} media:`, err);
    }
}

// Resolves media attached directly to `message`, and (if present) media on
// the message it quotes/replies to. Each candidate is resolved
// independently — a failure on one (download or transcription) is logged
// and skipped rather than aborting the rest, so e.g. a failed quoted-image
// download doesn't also lose a successfully-transcribed direct voice note.
export async function resolveIncomingMedia(client: any, message: any): Promise<ResolvedMedia> {
    const resolved: ResolvedMedia = { images: [], audioTranscripts: [] };

    await resolveOne(client, message, resolved);

    if (message.hasQuotedMsg) {
        try {
            const quoted = await message.getQuotedMessage();
            await resolveOne(client, quoted, resolved);
        } catch (err) {
            console.error('[debug] resolveIncomingMedia: failed to load quoted message:', err);
        }
    }

    return resolved;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/message-media.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/message-media.ts lib/message-media.test.ts
git commit -m "feat: add resolveIncomingMedia for direct and quoted chat media"
```

---

### Task 3: Widen `agent.ts`'s `callAgent` to accept `MessageContent`

**Files:**
- Modify: `agent.ts:1-2`, `agent.ts:46-60`

- [ ] **Step 1: Update the import and signature**

In `agent.ts`, change:

```ts
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
```

to:

```ts
import { HumanMessage, SystemMessage, type MessageContent } from "@langchain/core/messages";
```

Then change:

```ts
export async function callAgent(deviceName: string, message: string, localThreadId: string): Promise<string> {
    const agent = getDefaultAgent(deviceName);
    const result = await agent.invoke(
        { messages: [new HumanMessage(message)] },
```

to:

```ts
export async function callAgent(deviceName: string, content: MessageContent, localThreadId: string): Promise<string> {
    const agent = getDefaultAgent(deviceName);
    const result = await agent.invoke(
        { messages: [new HumanMessage(content)] },
```

(the rest of the function body — `recursionLimit`, `configurable.thread_id`
— is unchanged; only the parameter name/type and its one use-site change).

- [ ] **Step 2: Run the test suite**

Run: `pnpm test`
Expected: PASS — no existing test calls `callAgent` directly (it's
exercised live, per `whatsap/CLAUDE.md`'s testing conventions), so this
just confirms the type change compiles cleanly through every import site.

- [ ] **Step 3: Commit**

```bash
git add agent.ts
git commit -m "feat: widen callAgent to accept MessageContent for multimodal input"
```

---

### Task 4: Wire media resolution into `bot.ts`'s default `@ai` branch

**Files:**
- Modify: `bot.ts` (imports near the top; the default `else` branch, currently `bot.ts:349-358`)

- [ ] **Step 1: Add the new imports**

Add `resolveIncomingMedia` to the `lib/message-media.ts` import added in
Task 1, and import the `MessageContent` type:

```ts
import { downloadMessageMedia, transcribeAudio, resolveIncomingMedia } from './lib/message-media.ts'
import type { MessageContent } from "@langchain/core/messages"
```

- [ ] **Step 2: Replace the default `@ai` branch**

Change:

```ts
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
```

to:

```ts
            } else {
                try {
                    const { images, audioTranscripts } = await resolveIncomingMedia(client, message);
                    const text = [request, ...audioTranscripts].filter(Boolean).join('\n\n');

                    if (!text && images.length === 0) {
                        await message.reply('Sorry, I could not find anything to work with in that message.');
                    } else {
                        const content: MessageContent = images.length === 0
                            ? text
                            : [
                                ...(text ? [{ type: 'text' as const, text }] : []),
                                ...images.map((img) => ({ type: 'image' as const, mimeType: img.mimetype, data: img.data })),
                            ];
                        const response = await callAgent(deviceName, content, chatId);
                        console.log(`[${deviceName}] [debug] agent response:`, response);
                        await sendAgentResponse(client, chatId, response);
                    }
                } catch (err) {
                    console.error(`[${deviceName}] [debug] callAgent failed:`, err);
                    await message.reply('Sorry, something went wrong processing that request.');
                }
            }
```

- [ ] **Step 3: Update `@ai help`'s command list**

In the same file, the `@ai help` reply (around `bot.ts:237-250`) lists
every command — add a line documenting the new capability so it's
discoverable. Change:

```ts
                    '@ai <message> — talk to the default agent\n' +
                    `Voice notes sent to: ${STT_ALLOWED_CHATS.join(', ')} — auto-transcribed and forwarded to the default agent`
```

to:

```ts
                    '@ai <message> — talk to the default agent\n' +
                    '@ai <message> with an attached or quoted image/voice note — the agent sees the image or hears the transcribed audio\n' +
                    `Voice notes sent to: ${STT_ALLOWED_CHATS.join(', ')} — auto-transcribed and forwarded to the default agent`
```

- [ ] **Step 4: Run the test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bot.ts
git commit -m "feat: give the default agent images and transcribed audio from chat"
```

---

### Task 5: Manual verification against the running bot

Per `whatsap/CLAUDE.md`'s established practice, the live WhatsApp
client/page-context decrypt and the real multimodal call to Anthropic
aren't unit-testable — verify by hand.

**Files:** none (manual checklist only)

- [ ] **Step 1: Start the bot**

Run: `node index.ts`
Scan the QR code if this is a fresh session; wait for
`[<device>] Client is ready!` in the console.

- [ ] **Step 2: Verify direct image attachment**

From a WhatsApp client, send a photo with caption `@ai what is in this
image?` to the bot's chat.
Expected: the bot's reply describes the actual photo content (not a generic
"I can't see images" response), and console logs show
`[debug] agent response:` with that description.

- [ ] **Step 3: Verify direct voice note attachment**

Send a voice note with the bot's chat name as an `@ai`-prefixed message —
i.e. attach a voice note directly to a text message reading `@ai <describe
what's said in the deck (voice note attached)>` (or, if the client only
allows one attachment per message, send the voice note alone first, then
`@ai what did I just say?` as a reply/quote to it — see Step 4).
Expected: the agent's reply reflects the transcribed content of the audio.

- [ ] **Step 4: Verify quoted image and quoted voice note**

Send a plain photo (no caption/prefix) to the chat. In a separate message,
reply to that photo with `@ai describe this`.
Expected: the agent's reply describes the quoted photo.
Repeat with a plain voice note quoted by `@ai what did I say?`.
Expected: the agent's reply reflects the transcribed audio content.

- [ ] **Step 5: Verify graceful failure has no usable content**

Temporarily stop the `stt` container/service (or point `STT_URL` at an
unreachable address), then send a voice note quoted by `@ai transcribe
this` with no other text.
Expected: the bot replies with the "could not find anything to work with"
apology (or, if `request` text is non-empty because there's other text in
the message, that text alone still reaches the agent) — it must not crash
or hang.

- [ ] **Step 6: Confirm the existing hands-free voice-note flow still works**

From a chat listed in `STT_ALLOWED_CHATS`, send a bare voice note with no
`@ai` prefix at all.
Expected: unchanged behavior — auto-transcribed and forwarded to the
default agent, exactly as before this change.

---

## Self-Review Notes

- **Spec coverage:** direct-attachment resolution (Task 2/4), quoted-message
  resolution (Task 2), vision content-block construction (Task 4), audio →
  transcript merge into text (Task 4), no-allowlist-for-this-path (Task 4 —
  `resolveIncomingMedia` is called unconditionally, no `STT_ALLOWED_CHATS`
  check), scope limited to the default `@ai` branch only (Task 4 touches
  only that branch), untouched hands-free voice-note flow (Task 1 keeps its
  behavior identical, verified in Task 5 Step 6), error handling / partial
  failure (Task 2's skip-and-continue tests), testing strategy (Task 2's
  unit tests + Task 5's manual checklist) — all covered.
- **Type consistency:** `DownloadedMedia { data, mimetype }` (Task 1) is the
  type returned by `downloadMessageMedia` and consumed by both
  `transcribeAudio` and `resolveOne`/`resolveIncomingMedia` (Task 2) without
  renaming. `ResolvedMedia { images, audioTranscripts }` (Task 2) matches
  exactly what Task 4's `bot.ts` destructures (`const { images,
  audioTranscripts } = await resolveIncomingMedia(...)`). `callAgent`'s
  renamed `content: MessageContent` parameter (Task 3) matches how Task 4
  calls it (`callAgent(deviceName, content, chatId)`).
