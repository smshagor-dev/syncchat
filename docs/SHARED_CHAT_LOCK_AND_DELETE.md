# Shared Chat Lock and Telegram-style Delete

## Private chat lock modes

SyncChat private chats now support two lock scopes:

- `self` — the password locks only the current user's copy of the chat.
- `both` — one shared password locks the chat for both private-chat participants.

For a shared (`both`) lock, `chatLockOwnerId` records the user who enabled it. Both participants use the same bcrypt hash/password to unlock the chat, but only the lock owner may change the shared password or remove the shared lock.

The existing `chatLockBy` and `chatLockHashes` fields remain the password source of truth. Shared-lock metadata is stored in `chatLockScope` and `chatLockOwnerId`; password hashes are never returned by the inbox serializer.

### API

```text
POST   /api/inboxes/:roomId/chat-lock
PATCH  /api/inboxes/:roomId/chat-lock
DELETE /api/inboxes/:roomId/chat-lock
POST   /api/inboxes/:roomId/verify-lock
```

Create body:

```json
{
  "scope": "self | both",
  "password": "..."
}
```

Change body:

```json
{
  "oldPassword": "...",
  "newPassword": "..."
}
```

Shared lock state is broadcast through `inbox/chat-lock` so both connected users refresh their inbox lock state immediately.

## Delete chat scopes

`DELETE /api/chats/:roomId` accepts:

```json
{
  "scope": "self | both"
}
```

- `self` hides/deletes the conversation only for the requesting user by adding that user to inbox/message `deletedBy`. The other participant keeps the conversation. A later new message can make the chat visible again while preserving the room participants.
- `both` is available only for private chats. It permanently removes the inbox, messages, scheduled messages and room-owned attachment records/files, then sends `inbox/delete` to both participants.

If every participant independently chooses `self`, the room has no remaining visible copy and is physically cleaned up.
