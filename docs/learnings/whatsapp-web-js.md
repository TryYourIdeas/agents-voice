# whatsapp-web.js: diagnosing breakage after WhatsApp Web updates

`whatsap/` drives WhatsApp Web in headless Chromium through `whatsapp-web.js`
(installed: **1.34.7**, released 2026-04-24). Most of the library is code that
runs *inside* WhatsApp's own page and calls its internal webpack modules, so a
WhatsApp release can break it with no change on our side. Stack frames that
point at `static.whatsapp.net/rsrc.php/...` are WhatsApp's bundle, not ours.

## Reference sources (local, git-ignored)

Clone these under `references/` (shallow clones, ~5 MB total) and grep them
before guessing:

| Directory | Source | What it is |
|---|---|---|
| `references/whatsapp-web.js/` | https://github.com/jlabrada/whatsapp-web.js | Fork of the library, ahead of the npm release. Read `src/util/Injected/Utils.js` (browser-side helpers: `sendMessage`, `processMediaData`, `getMessageModel`, `resolveMediaBlob`), `src/Client.js` (Node side + `pupPage.evaluate` bodies) and `src/structures/Message.js`. `git log` shows the post-1.34.7 fixes. |
| `references/wwebjs.dev/` | https://github.com/jlabrada/wwebjs.dev | Source of the guide site: `src/guide/creating-your-bot/` (`handling-attachments.md`, `authentication.md`, `mentions.md`), `installation.md`, `what-is-new.md`. Usage docs only, no internals. |

```sh
mkdir -p references && cd references
git clone --depth 1 https://github.com/jlabrada/whatsapp-web.js
git clone --depth 1 https://github.com/jlabrada/wwebjs.dev
git -C whatsapp-web.js fetch --depth 400 origin    # to see history
```

Compare the installed copy with the fork to see what is already fixed upstream:

```sh
diff -u whatsap/node_modules/whatsapp-web.js/src/util/Injected/Utils.js \
        references/whatsapp-web.js/src/util/Injected/Utils.js
```

## Current dependency

`whatsap/package.json` pins the fork at commit `064a3d5` (`github:jlabrada/whatsapp-web.js#064a3d5…`),
which still reports version 1.34.7 but contains the fixes below. `pnpm-workspace.yaml`
lists `whatsapp-web.js` in `onlyBuiltDependencies` (pnpm refuses to prepare a git-hosted
package otherwise), and installs need `PUPPETEER_SKIP_DOWNLOAD=true` (the Dockerfile sets it)
because pnpm runs `npm install` for the package. To move to a newer fork commit, replace the hash and run
`PUPPETEER_SKIP_DOWNLOAD=true pnpm add github:jlabrada/whatsapp-web.js#<hash>`.

## Known incompatibilities of 1.34.7 with current WhatsApp Web

Both are fixed in the fork (`064a3d5`, 2026-09-28) and not in the npm 1.34.7 release this project used before.

1. **`id._serialized` was renamed to `id.$1`** (WhatsApp's July 2026 update;
   fork commit `58ddf15`, issue #201829). Any code reading
   `message.id._serialized` gets `undefined`. The fork adds `Base._normalizeId()`
   to copy `$1` into `_serialized`. Symptom here: `messageIdOf(message)` found
   no id, so the store-download fallback in `lib/message-media.ts` was skipped
   ("no message id for store download"). `messageIdOf` now also reads `$1`.
2. **Sending any media fails with `Data passed to getter must include an id
   property (it's how we memoize) but got undefined`** (fork commit `064a3d5`,
   issue #201922). `WWebJS.processMediaData` returns a `MediaData` model whose
   private `__x_id` field collides with the outgoing `Msg`'s own `id` when
   `sendMessage` spreads `mediaOptions` into the message, so
   `getValidatedSender()` fails inside `Msg.initialize`. The "id" in the error
   is the **message's** id, not the media filehash. Text messages are unaffected;
   every media send is (voice replies, `[[DIAGRAM:...]]` images). Fix: delete
   `message.__x_id` before spreading (6 lines in `Utils.js`). Not fixable from
   our code short of patching the library.

Also in the fork but not 1.34.7: `downloadMedia` now goes through
`WWebJS.resolveMediaBlob(msgId)` (WhatsApp's own `msg.downloadMedia()` + the
in-memory blob cache) instead of calling `downloadAndMaybeDecrypt` by hand,
which is what stopped working for voice notes ("Unexpected mimetype
application/octet-stream for media type ptt/audio").

## Diagnosis checklist

1. Which side threw? Frames in `static.whatsapp.net/...` = WhatsApp's page code
   reached through `pupPage.evaluate`; the first `file:///app/...` / `node_modules/whatsapp-web.js` frame below it is the call that triggered it.
2. Grep the error text in `references/whatsapp-web.js` (`git log -S"<text>"`, `git log --grep`). Upstream usually has a fix within days of a WhatsApp release.
3. Compare installed vs fork `Utils.js`/`Client.js` (diff above).
4. Per-message visibility: `bot.ts` logs a `[msg-type]` line for every event
   (type, fromMe, hasMedia, mimetype, ids). Agent loops: `[trace]` lines from
   `lib/message-trace.ts` (needs `NUXT_ADD_DEBUG_LOGS=true`).
5. `lib/voice-reply.ts#diagnoseMediaPrep` replays WhatsApp's media-prep step
   without sending; it checks the file, but note that for item 2 above the file
   was fine and the failure came later, in `Msg` construction.

## Lesson

A first guess from reading the *installed* code (that the missing id was the
media `filehash`) was wrong; the fork's git history had the real cause. Check
the upstream log before instrumenting.
