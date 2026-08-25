# SyncChat Flutter Functional Parity

The web client remains the behavioral source of truth. A screen is not considered functionally complete only because its design is present.

## Live now

- Authenticated session restore and Socket.IO connection
- Inbox, contacts, status, communities, channels, and profile data
- Room history, text send, realtime inserts, receipts, read state, typing, and catch-up sync
- Photo, video, camera, and document upload/send
- Reply, edit, reactions, star, pin, delete-for-me, and delete-for-everyone
- View-once media/message opening
- Scheduled, recurring, and send-when-online messages
- Forward-message destination picker using the existing `chat/forward` contract
- Native voice-note capture, upload/send as `file.type=audio`, stored duration, playback, seek, and 1x/1.5x/2x speed

## Guarded / pending native runtime

- Device E2EE send remains blocked until mobile key exchange and secure key storage are implemented.
- Android/iOS platform projects and permission manifests still need to be committed before release builds can validate microphone, camera, notifications, deep links, and calling on devices.
- Audio/video/group-call media runtime remains pending.
