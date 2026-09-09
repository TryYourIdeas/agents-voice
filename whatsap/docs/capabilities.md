# WhatsApp interface capabilities

This documents what the WhatsApp side of this bot can do — both what the underlying
`whatsapp-web.js` library (`v1.34.6`, pinned in `package.json`) exposes, and what this project
currently wires up out of that. Source: `node_modules/whatsapp-web.js/src/Client.js` and
`src/structures/*.js` (read directly, since the library's own docs site isn't vendored here).

## How it works

`whatsapp-web.js` doesn't talk to a WhatsApp API — it drives a real, headless WhatsApp Web session
via Puppeteer/Chromium (see `client.ts`/`index.ts`, `docker-entrypoint.sh` for the container-specific
Chromium flags) and calls WhatsApp Web's own internal JS functions from inside the page. That's why:

- It requires either scanning a QR code or requesting a pairing code to link the session, exactly
  like opening web.whatsapp.com on a new device.
- The linked phone must stay online and connected (multi-device mode, so the phone doesn't need to
  stay awake, but it must not be logged out).
- **Not officially supported by WhatsApp/Meta.** Using it risks the linked number being blocked —
  this is explicit in the library's own README.

## What this bot currently does

`index.ts` is the real entrypoint (`client.ts`/`coordinator.ts` are unused duplicates — see
`../CLAUDE.md`). It currently only uses a small slice of the library:

| Trigger | Behavior |
|---|---|
| `!ping` (any chat) | Replies `pong` via both `client.sendMessage()` and `message.reply()` |
| `@ai list channels` | Calls `client.getChats()`, replies with a plain-text list of chat names |
| `@ai <anything else>` | Forwards the text to the LangChain/Anthropic agent (`agent.ts`) via `callAgent()`, replies with its response |
| Every message | Logged verbatim (body + sender metadata) to `logs.txt` via `logToFile()` |

Listens on `message_create` (fires for the bot's own sent messages too, since `debug = true`) rather
than `message` (received-only) — see `index.ts`. All replies are plain text; no media, groups, or
rich message types are sent or received today.

## Full capability surface (library-level)

Everything below is available on the `Client` instance (`whatsap/client.ts` / `index.ts`) even though
the bot doesn't use most of it yet. Grouped by area, with the relevant `Client` method(s) in
backticks.

### Session / connection

- **Link a device**: QR code (`qr` event, what this bot uses) or a numeric pairing code
  (`client.requestPairingCode(phoneNumber)`), including auto-refreshing the code on an interval.
- **Auth persistence strategies** (`authStrategies/`): `LocalAuth` (used here — session written to
  disk under `./session`), `NoAuth` (re-scan every restart), `RemoteAuth` (session synced to a
  remote store, e.g. for multi-instance/ephemeral deployments — not installed as a dependency here).
- **Lifecycle**: `client.initialize()`, `client.destroy()`, `client.logout()`,
  `client.getState()` (`WAState`: `CONNECTED`, `OPENING`, `PAIRING`, `CONFLICT`, `TIMEOUT`,
  `TOS_BLOCK`, etc.), `client.resetState()`, `client.getWWebVersion()`.
- **Presence**: `client.sendPresenceAvailable()` / `sendPresenceUnavailable()` (online/offline),
  `chat.sendStateTyping()` / `sendStateRecording()` / `clearState()` (typing/recording indicators).

### Sending messages

`client.sendMessage(chatId, content, options)` / `chat.sendMessage(content, options)` — `content`
can be:

- Plain text (what this bot sends today), with `linkPreview`, `mentions` (user IDs),
  `groupMentions`, `quotedMessageId` (reply-to) as options.
- `MessageMedia` — images, audio, video, documents, sent as a normal attachment, as a sticker
  (`sendMediaAsSticker`, with `stickerName`/`stickerAuthor`/`stickerCategories`), as a document
  (`sendMediaAsDocument`), as HD (`sendMediaAsHd`), or as view-once (`isViewOnce`). Built via
  `MessageMedia.fromFilePath(path)` or `MessageMedia.fromUrl(url)`.
- `Location` — send a GPS location.
- `Contact` or `Contact[]` — send one or more contact cards (vCards).
- `Poll` — create a poll (single or multi-select).
- Buttons/Lists — supported by the type system but **deprecated by WhatsApp itself**; the library
  warns and effectively no-ops on send.

Channels (newsletters) and status broadcasts accept a narrower subset (text, image, gif,
audio/voice, video, poll — no documents, contacts, locations, or quoted replies).

### Receiving / reacting to messages

- Events: `message` (incoming only) vs `message_create` (incoming + the bot's own outgoing —
  what this bot listens on), `message_ack` (delivery/read receipts), `message_edit`,
  `message_revoke_everyone` / `message_revoke_me` (deletions), `message_reaction`,
  `message_ciphertext` (still-encrypting placeholder before content decrypts), `unread_count`.
- Per-message actions (`structures/Message.js`): `.reply()`, `.react(emoji)`, `.forward(chat)`,
  `.delete(everyone)`, `.star()`/`.unstar()`, `.pin(duration)`/`.unpin()`, `.edit()`,
  `.downloadMedia()`, `.getQuotedMessage()`, `.getMentions()`/`.getGroupMentions()`,
  `.getReactions()`, `.getInfo()` (delivery/read details), `.getOrder()`/`.getPayment()`
  (WhatsApp Business order/payment messages), `.getPollVotes()`/`.vote()`.
- `client.searchMessages(query, options)`, `client.getMessageById()`.

### Chats

`client.getChats()`, `client.getChatById()`, per-chat (`structures/Chat.js`): `.archive()`/
`.unarchive()`, `.pin()`/`.unpin()`, `.mute(until)`/`.unmute()`, `.markUnread()`,
`.clearMessages()`, `.delete()`, `.fetchMessages(options)` (paginated history),
`.getLabels()`/`.changeLabels()`, `.getPinnedMessages()`, `.syncHistory()`.

### Groups

`client.createGroup(title, participants, options)`, and on a `GroupChat`:
`.addParticipants()`/`.removeParticipants()`, `.promoteParticipants()`/`.demoteParticipants()`,
`.setSubject()`/`.setDescription()`, `.setPicture()`/`.deletePicture()`,
`.setAddMembersAdminsOnly()`/`.setMessagesAdminsOnly()`/`.setInfoAdminsOnly()` (group settings),
`.getInviteCode()`/`.revokeInvite()`, `client.acceptInvite(code)`,
`.getGroupMembershipRequests()`/`.approveGroupMembershipRequests()`/`.rejectGroupMembershipRequests()`
(join-request approval flow), `.leave()`. Events: `group_join`, `group_leave`,
`group_admin_changed`, `group_membership_request`, `group_update`.

### Channels (newsletters)

`client.createChannel()`, `.deleteChannel()`, `.subscribeToChannel()`/`.unsubscribeFromChannel()`,
`.getChannelByInviteCode()`, `.transferChannelOwnership()`, `.searchChannels()`,
`.sendChannelAdminInvite()`/`.acceptChannelAdminInvite()`/`.revokeChannelAdminInvite()`/
`.demoteChannelAdmin()`.

### Contacts

`client.getContacts()`, `client.getContactById()`, `client.isRegisteredUser(id)`,
`client.getNumberId()`/`getFormattedNumber()`/`getCountryCode()`, and per-contact
(`structures/Contact.js`): `.block()`/`.unblock()`, `.getProfilePicUrl()`, `.getAbout()`
(status/bio text), `.getCommonGroups()`, `.getChat()`. `client.getBlockedContacts()`.
`client.saveOrEditAddressbookContact()`/`.deleteAddressbookContact()`,
`.addOrEditCustomerNote()` (WhatsApp Business).

### Profile / account settings

`client.setStatus(text)` (status message), `client.setDisplayName(name)`,
`client.setProfilePicture(media)`/`.deleteProfilePicture()`, `client.setDeviceName()`,
`client.setAutoDownloadPhotos()`/`Videos()`/`Audio()`/`Documents()`,
`client.setBackgroundSync(flag)`.

### Other

- **Labels** (WhatsApp Business): `client.getLabels()`, `.getLabelById()`, `.getChatLabels()`,
  `.getChatsByLabelId()`, `.addOrRemoveLabels()`.
- **Broadcast lists**: `client.getBroadcasts()`, `.getBroadcastById()`.
- **Scheduled events / calls**: `client.createCallLink()`, `.sendResponseToScheduledEvent()`,
  `message.editScheduledEvent()`. `call` event fires on an incoming call (the library can detect
  but not answer/place calls).
- **Battery/state**: `change_battery`, `change_state`, `disconnected` events;
  `client.getContactDeviceCount()`.

## Not supported (by WhatsApp itself, not just this library)

Per the library's own feature table: Buttons and Lists are deprecated and effectively non-functional
(WhatsApp removed server-side support). Voting in polls programmatically and Communities are marked
upcoming/unimplemented in this library version.

## Practical implications for extending this bot

- Anything under **Sending messages** / **Receiving / reacting** is directly usable from the
  `client`/`message` objects already in scope in `index.ts`'s message handler — e.g. `message.react()`
  for a lightweight ack instead of a text reply, or `client.sendMessage(chatId, MessageMedia.fromFilePath(...))`
  to have the agent return generated audio (this repo's `text-to-speech` service, notably) as a voice
  note (`sendAudioAsVoice: true`) instead of text.
- Group-management and channel-admin actions require the bot's linked account to actually hold admin
  rights in that group/channel — the API doesn't grant permissions, it just calls what a normal
  WhatsApp Web session logged in as that account could do by hand.
- `RemoteAuth` (session persisted remotely instead of `./session` on disk) would matter if this bot
  ever needs to run as a replaceable/stateless container rather than the current bind-mounted,
  single-instance setup — see `../CLAUDE.md`'s note on `session/` persistence and
  `../../docs/user-guides/config.md`'s WhatsApp bot stack section for how `./session` is mounted
  today.
