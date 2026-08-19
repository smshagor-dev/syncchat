# SyncChat Chat V2 — Final Security Boundary

The production Chat V2 layer is fail-closed around the features that are not yet cryptographically implemented.

## Device E2EE

New private-chat text messages can use browser-device E2EE with P-256 ECDH, HKDF-SHA256 and AES-256-GCM. Device private keys stay in browser IndexedDB; the backend stores public device keys/fingerprints and encrypted message envelopes.

This implementation is intentionally **not described as Signal Protocol / Double Ratchet**. It does not claim Signal-style forward secrecy, post-compromise security, safety-number verification UX, or encrypted media attachments.

While device E2EE is enabled:

- plaintext `chat/insert` events are rejected server-side;
- media upload/send is blocked by the official client and media send is rejected server-side;
- scheduled server-side messages are rejected;
- message editing is rejected until encrypted edit envelopes exist;
- forwarding is rejected to prevent a plaintext downgrade;
- server AI translation/transcription remains disabled for encrypted content;
- drafts remain device-local instead of being persisted as plaintext on the server;
- offline queued E2EE text is sealed locally with a non-extractable AES-GCM key before it is stored in IndexedDB;
- cached E2EE history stores the raw encrypted server payload and decrypts only in memory;
- revoked linked-device E2EE public keys are removed from the active key directory.

## Reliable delivery

Normal text and media messages use stable `clientMessageId` values. Message metadata is attached at creation through an AsyncLocalStorage-backed create context so the unique sender/client-message constraint is atomic rather than patched after the message is created. Per-room sequence numbers drive reconnect catch-up.

## Existing linked devices

Chat V2 reuses SyncChat's existing linked-device/session model. Socket authentication, device receipts and E2EE public keys are bound to the verified session ID; revoked sessions are rejected rather than creating a second device subsystem.

## Production QA

Before merging this branch to `main`, validate at minimum:

1. user/admin Socket.IO handshake authentication and revoked-session rejection;
2. duplicate retry with the same `clientMessageId` creates one message only;
3. reconnect sequence catch-up and offline outbox ordering;
4. delivery/read receipt records across two linked sessions;
5. message request Accept/Delete/Block behavior;
6. `@username`, `@admins`, and admin-only `@all` autocomplete and notifications;
7. topic create/select/filter/send behavior;
8. E2EE text between two users and multiple active devices;
9. E2EE fail-closed media/schedule/edit/forward behavior;
10. resumable upload retry and FTP/FTPS final storage;
11. search, edit-history, translation and transcription provider flows;
12. Redis-backed flood protection across more than one backend instance.
