# Chat V2 Hardening Notes

This follow-up hardens the production Chat V2 layer added on `agent/shared-chat-lock-delete-scope`.

## E2EE local-storage safety

The web/PWA transport stores **raw server payloads before E2EE decryption**. E2EE plaintext produced in memory is not written back to the message cache.

The cache also refuses to persist legacy Secret Chat, disappearing, view-once, secret-system, or already-decrypted E2EE records.

Outgoing E2EE text that is queued while offline is sealed locally using a non-extractable AES-GCM key stored as a browser `CryptoKey` in IndexedDB. When connectivity returns, the local sealed payload is opened in memory, encrypted for the active recipient device directory, and then sent. The same `clientMessageId` is retained across retry.

This means offline queue support does not require storing E2EE plaintext in IndexedDB.

## Revoked-device E2EE keys

Before E2EE key-directory reads and room E2EE state changes, SyncChat reconciles active E2EE device keys against `user_sessions`. Keys belonging to revoked or missing sessions are marked inactive and excluded from future envelopes.

## Media idempotency

`POST /api/chats/send-file` now receives a stable `clientMessageId` from the web client and retries network failures with the same ID. The server checks that ID before sending and patches successful file messages with a room sequence number, mentions, and selected topic metadata.

This protects the common "server accepted the media message but the response was lost" retry case from creating duplicate messages.

## Mention autocomplete

Typing `@` in the active composer opens participant suggestions. Supported special mentions:

- `@admins`
- `@all` for group/channel admins

The suggestion API only returns profiles belonging to a room the authenticated user can access.

## Resumable-upload maintenance

Chat maintenance now:

- expires abandoned resumable uploads
- removes stale MongoDB chunk sessions
- removes terminal upload metadata after seven days
- removes drafts older than 90 days
- removes device receipt metadata older than 180 days
- reconciles stale E2EE public keys

It runs automatically whenever the existing scheduled-message cron is invoked and is also available at:

```text
GET /api/internal/chat-maintenance/run
Authorization: Bearer <CRON_SECRET>
```

## Remaining cryptographic boundary

SyncChat's new device E2EE is server-blind for **new private-chat text messages** and uses P-256 ECDH, HKDF-SHA256, and AES-256-GCM with browser-held private keys.

It is intentionally **not described as Signal Protocol / Double Ratchet**. It does not yet provide Signal-style forward secrecy, post-compromise security, safety-number verification UX, or encrypted media attachments. Existing legacy Secret Chat remains a separate server-side AES-GCM feature.

Those protocol properties require a vetted ratchet implementation and interoperability/security review rather than an ad-hoc claim of Signal compatibility.
