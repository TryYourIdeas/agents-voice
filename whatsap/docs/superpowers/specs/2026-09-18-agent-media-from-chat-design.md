# Agent access to images and audio from the chat

## Problem

The default agent (`agent.ts`'s `callAgent`) only ever receives plain text.
`bot.ts` already has a narrow audio path — voice notes are auto-transcribed
and forwarded to the default agent, but only in chats listed in
`STT_ALLOWED_CHATS`, and only when there's no `@ai` prefix (voice notes have
no text body to prefix). There is no path at all for images, and no way to
ask about media attached to an explicit `@ai` command or to an earlier
message the user is replying to.

Users should be able to send `@ai <text>` with an image or voice note
attached — directly, or as a reply (quote) to an earlier image/voice-note
message — and have the agent actually see the image (vision) or hear the
audio (transcribed to text), not just the caption.

## Scope

- Only the default `@ai <text>` catch-all branch in `bot.ts` (the final
  `else` that calls `callAgent`). Other `@ai` subcommands (`@agent`,
  `schedule`, etc.) are unaffected.
- Media attached directly to the `@ai` message, and media on a message it
  quotes/replies to. Both may be present; each is resolved independently.
- Images and audio only (matches `hasMedia` types `'image'`, `'ptt'`,
  `'audio'`). No video/document handling.
- No allowlist — this only ever fires on an explicit `@ai` command, so
  (unlike the existing hands-free voice-note auto-forward) it applies in
  any chat.
- The existing allowlisted, prefix-less voice-note auto-transcribe flow in
  `bot.ts` is untouched.

## Design

### `lib/message-media.ts` (new)

Extracts and generalizes `bot.ts`'s current `downloadAudioMedia`, which
bypasses `whatsapp-web.js`'s `message.downloadMedia()` (it throws for this
self-chat's `@lid`-addressed messages) by decrypting directly from
`message.rawData` inside the Puppeteer page context via
`WAWebDownloadManager`. That decrypt call is not audio-specific — it works
for any `hasMedia` message — so it generalizes to:

```ts
async function downloadMessageMedia(client, rawData): Promise<{ data: string; mimetype: string } | undefined>
```

(same implementation as today's `downloadAudioMedia`, just no longer named
for audio only).

Built on top of it:

```ts
type ResolvedMedia = {
    images: { data: string; mimetype: string }[];
    audioTranscripts: string[];
};

async function resolveIncomingMedia(client, message): Promise<ResolvedMedia>
```

Logic:
1. Collect candidate media sources: the message itself (if `hasMedia`), and
   — if `message.hasQuotedMsg` — the quoted message via
   `message.getQuotedMessage()` (if *it* `hasMedia`).
2. For each candidate, branch on `type`:
   - `'image'` → `downloadMessageMedia`, push `{data, mimetype}` onto
     `images`.
   - `'ptt'` / `'audio'` → `downloadMessageMedia` then the existing
     `transcribeAudio()` (moved here from `bot.ts`, unchanged), push the
     resulting text onto `audioTranscripts`.
   - anything else → ignored.
3. Any single item's download or transcription failure is caught and
   logged, and that item is dropped rather than aborting the whole
   resolution — matches the "skip and continue" pattern already used
   elsewhere in `bot.ts`.

### `agent.ts`

`callAgent`'s `message: string` parameter becomes LangChain's
`MessageContent` type (`string | MessageContentComplex[]`), passed straight
through into `new HumanMessage(message)` as today — `createAgent`/
`HumanMessage` already accept either. No other change: the same
`ChatAnthropic` instance handles vision content blocks natively.

### `bot.ts`

In the default `@ai` branch only, before calling `callAgent`:

1. Call `resolveIncomingMedia(client, message)`.
2. Merge: `text = [request, ...audioTranscripts].filter(Boolean).join('\n\n')`
   (`request` is the existing `@ai`-stripped body/caption text).
3. If `images.length === 0`, call `callAgent(deviceName, text, chatId)`
   exactly as today (plain string — no behavior change for the common
   text-only case).
4. If `images.length > 0`, build a content array: one text block (if
   `text` is non-empty) followed by one image block per resolved image,
   and call `callAgent(deviceName, contentArray, chatId)`.
5. If resolution produced nothing usable at all (empty `text` and no
   images — e.g. every download/transcription failed and there was no
   caption), reply with the existing style of apology message instead of
   calling the agent with empty content.

The image content-block shape (LangChain's standard multimodal block vs.
the OpenAI-style `image_url` block both of which `ChatAnthropic` accepts)
is an implementation detail to confirm against the installed
`@langchain/core`/`@langchain/anthropic` versions during implementation,
not fixed by this spec.

## Error handling

Unchanged pattern from the rest of `bot.ts`: per-item media failures are
logged and skipped; total failure (nothing usable resolved) replies with an
apology instead of throwing; unexpected errors in the branch are still
caught by the existing outer `try/catch` around the default `@ai` call.

## Testing

`lib/message-media.ts`'s `resolveIncomingMedia` merge/selection logic
(given mocked message / quoted-message shapes: which `type`s produce
images vs. transcripts, multiple-quoted-plus-direct combinations, and
skip-on-failure behavior) gets a `message-media.test.ts`, following the
convention in `lib/tasks.test.ts` / `scheduler.test.ts` — the network
download and page-context decrypt calls are mocked/stubbed, not exercised
for real. The live decrypt-from-page-context call and the actual
multimodal call to Anthropic are not unit-testable (same as today's
`downloadAudioMedia`/`callAgent`) and are verified by hand against the
running bot, per this repo's established practice (see
`whatsap/CLAUDE.md`).
