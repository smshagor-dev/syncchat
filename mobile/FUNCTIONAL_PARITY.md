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

## Native incoming-call wake

- Android background/terminated incoming calls use FCM data pushes plus full-screen CallKit-style UI.
- iOS background/terminated incoming calls use PushKit VoIP pushes and system CallKit.
- Native token registration uses `/settings/push/native/register`; provider private keys stay server-side.
- Android client Firebase values are supplied at build time with `SYNCCHAT_FIREBASE_API_KEY`, `SYNCCHAT_FIREBASE_APP_ID`, `SYNCCHAT_FIREBASE_MESSAGING_SENDER_ID`, and `SYNCCHAT_FIREBASE_PROJECT_ID` dart-defines.
- iOS release signing must enable Push Notifications and Voice over IP background capability for the production bundle identifier.
- The durable backend `callId` is preserved from push -> native answer -> Socket.IO/WebRTC/LiveKit join.
- Group-call hosts can mute or remove participants through the existing `call/moderate` contract.
