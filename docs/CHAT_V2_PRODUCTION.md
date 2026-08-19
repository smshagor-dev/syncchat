# SyncChat Chat V2 Production Layer

This document describes the production messaging capabilities added on top of the existing SyncChat chat, group, channel, media, scheduling, secret-chat and moderation features.

## 1. Authenticated Socket.IO identity

Socket.IO now requires a valid user or admin session token during the WebSocket handshake.

- Client: `auth.token`
- Admin: `auth.adminToken`
- Revoked device/admin sessions are rejected.
- User sockets cannot emit `admin/*` events.
- Admin sockets cannot emit user events.
- Legacy `user/connect` and `user/disconnect` IDs are replaced server-side with the verified socket identity.
- Actor fields such as `userId`, `senderId`, `fromUserId` and `actorId` are replaced with the verified user ID while target IDs remain untouched.

This removes the previous client-supplied socket identity trust boundary.

## 2. Reliable delivery and reconnect catch-up

Every normal socket text message gets:

- stable `clientMessageId`
- idempotent duplicate protection
- monotonic per-room `sequence`
- `chat/ack`
- IndexedDB outbox on the web client
- automatic retry after reconnect
- sequence-based `chat/sync-request` / `chat/sync-result`
- recent-message IndexedDB cache with GET fallback while offline

Room sequence counters are stored in MongoDB and incremented atomically.

## 3. Per-user/per-device receipts

`message_receipts` records delivery/read state by:

- `chatId`
- `userId`
- linked `sessionId`
- `deliveredAt`
- `readAt`

The legacy `delivered` and `readed` booleans are still updated for backward compatibility.

## 4. Multi-device

SyncChat already had linked-device/session infrastructure. Chat V2 uses the existing session ID for:

- socket authentication
- device receipts
- E2EE public device keys
- revoked-session rejection

No duplicate device system was created.

## 5. Device E2EE foundation

Private chats can enable server-blind browser-device encryption for new text messages.

Crypto:

- P-256 ECDH device keys
- per-device ephemeral ECDH wrapping key
- HKDF-SHA256 derivation
- AES-256-GCM content encryption
- AES-256-GCM content-key wrapping
- device public keys/fingerprints stored on the server
- private keys stay in browser IndexedDB

The server stores only the encrypted `e2eeEnvelope` and placeholder text for E2EE messages. Server-side AI translation/transcription is intentionally rejected for E2EE content.

### Security boundary

This is a server-blind device E2EE foundation. It is **not** the Signal Double Ratchet protocol and does not claim Signal-style forward secrecy, post-compromise security, safety-number UX, or encrypted media attachments yet. Existing legacy Secret Chat is separate and remains server-side AES-GCM.

## 6. Draft sync

Drafts are stored per user + room in MongoDB and restored into the composer.

- text
- reply metadata
- selected topic
- multi-device/server persistence
- auto-clear after successful send

## 7. Mentions

Chat text supports:

- `@username`
- `@admins`
- `@all` in group/channel rooms when the sender is an admin

Mention targets are stored on the message and can be retrieved from the Mentions panel/API.

## 8. Message Requests

Unknown-user messages can be staged into a dedicated request queue when the recipient has message requests enabled.

Actions:

- Accept
- Delete/decline
- Block

Pending requests are hidden from the normal inbox until accepted.

## 9. Offline cache and outbox

Web/PWA uses IndexedDB for:

- recent chat cache
- per-room last sequence
- durable outgoing queue

When the normal chat GET fails due to a network error, cached room messages can be returned to the existing UI. Sending while offline keeps the same `clientMessageId` when retried.

## 10. Resumable media upload

Large-file uploads use:

1. create upload session
2. upload numbered binary chunks
3. persist chunks in MongoDB `resumable_upload_chunks`
4. retry failed chunks from the client
5. assemble after all chunks arrive
6. upload completed file to configured FTP/FTPS storage
7. create the normal SyncChat file record
8. send the file through the existing message path

Temporary upload sessions expire after 24 hours.

## 11. Advanced search

`GET /api/chat-v2/search` supports:

- search text
- current room or all rooms
- sender
- date range
- selected topic
- type: text/image/video/audio/document/link/call/poll

The Chat Tools panel exposes search plus receipts, edit history, translation and voice transcription actions.

## 12. Group/channel topics

Groups/channels can have forum-style topics.

- admin creates topic
- topic creator/admin can update/delete
- pin/close state
- selected topic is stored locally and synced with drafts
- new socket messages inherit selected `topicId`
- normal room history is filtered to the selected topic; “All messages” removes the filter

## 13. Translation and voice transcription

Provider configuration is DB-backed from the Admin Chat AI panel.

Admin API:

```text
GET   /api/admin/chat-ai/config
PATCH /api/admin/chat-ai/config
```

Provider API keys are AES-256-GCM encrypted at rest using:

```text
CHAT_AI_CONFIG_SECRET
  -> CALL_CONFIG_SECRET
  -> STORAGE_CONFIG_SECRET
  -> JWT_SECRET
```

The generic provider contracts are:

### Translation request

```json
{
  "q": "source text",
  "text": "source text",
  "source": "auto",
  "target": "en",
  "format": "text"
}
```

Accepted response fields: `translatedText`, `translation`, `text`, or `output`.

### Transcription request

```json
{
  "audioBase64": "...",
  "mime": "audio/webm",
  "filename": "voice.webm",
  "language": "auto"
}
```

Accepted response fields: `transcript`, `text`, or `output`.

No provider is hardcoded. If the admin has not configured a provider, the runtime endpoint returns `503` instead of pretending AI is available.

## 14. Spam/flood protection

Normal chat inserts are protected by:

- message-rate limit
- repeated-text flood detection
- link count limit
- mention count limit

With `REDIS_URL`, counters work across backend instances. Without Redis there is a single-process fallback.

Defaults:

```env
CHAT_RATE_LIMIT_MESSAGES=30
CHAT_RATE_LIMIT_WINDOW_SEC=10
CHAT_DUPLICATE_LIMIT=6
CHAT_DUPLICATE_WINDOW_SEC=30
```

## 15. Edit history viewer

Existing `editHistory` data is exposed by:

```text
GET /api/chat-v2/messages/:chatId/history
```

The Chat Tools search result UI exposes the viewer for edited messages.

## Runtime endpoints

```text
GET    /api/chat-v2/messages/:chatId/receipts
GET    /api/chat-v2/messages/:chatId/history
GET    /api/chat-v2/drafts
GET    /api/chat-v2/drafts/:roomId
PUT    /api/chat-v2/drafts/:roomId
DELETE /api/chat-v2/drafts/:roomId
GET    /api/chat-v2/mentions
GET    /api/chat-v2/search
GET    /api/chat-v2/message-requests
POST   /api/chat-v2/message-requests/:requestId/action
GET    /api/chat-v2/topics/:roomId
POST   /api/chat-v2/topics/:roomId
PATCH  /api/chat-v2/topics/item/:topicId
DELETE /api/chat-v2/topics/item/:topicId
PUT    /api/chat-v2/e2ee/device-key
GET    /api/chat-v2/e2ee/keys
GET    /api/chat-v2/e2ee/rooms/:roomId
POST   /api/chat-v2/e2ee/rooms/:roomId
POST   /api/chat-v2/uploads
PUT    /api/chat-v2/uploads/:uploadId/parts/:partNumber
GET    /api/chat-v2/uploads/:uploadId
POST   /api/chat-v2/uploads/:uploadId/complete
DELETE /api/chat-v2/uploads/:uploadId
POST   /api/chat-v2/translate
POST   /api/chat-v2/transcribe
```

## Production QA checklist

- two browser/device sessions cannot spoof another user over Socket.IO
- revoked session cannot reconnect to Socket.IO
- same `clientMessageId` submitted twice creates one message
- offline queued message sends once after reconnect
- sequence catch-up restores missed messages
- delivery/read receipt is recorded per device
- draft appears on another linked device
- unknown sender appears in Requests, not normal inbox
- Accept/Delete/Block request flows are tested
- `@username`, `@admins`, and admin-only `@all` are tested
- topic create/select/send/filter/delete is tested
- E2EE text decrypts on every registered device and server cannot recover plaintext from envelope
- E2EE send fails closed when a participant has no registered device key
- large upload survives chunk retry and lands on configured FTP/FTPS storage
- search filters return only accessible non-deleted messages
- provider-less AI actions return `503`
- configured translation/transcription provider works end-to-end
- spam/flood limits work with Redis across multiple backend instances
