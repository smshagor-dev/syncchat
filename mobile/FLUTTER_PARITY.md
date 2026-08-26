# SyncChat Flutter parity status

The web client is the product/protocol source of truth. The Flutter client uses native mobile layouts but is required to preserve the same user-visible sections, account controls, chat actions, security rules, and backend contracts.

## Live functionality

The production Flutter path is `SyncChatMobileApp -> LiveMobileShell`. It includes:

- Sign in, sign up, password recovery, verification, QR/device linking, Google/Facebook social authentication, 2FA and recovery-code login.
- Five primary tabs: Chats, Status, Communities, Channels and Calls.
- Full-page navigation for contacts, device contacts, groups, communities, channels, message requests, chat tools, room administration/security, rich attachments, Archive, Lists, Starred messages, Media, Profile and Settings.
- Profile photo, profile fields, QR/profile links and social-profile management.
- Web-equivalent settings for account/security, devices, privacy, chats/media defaults, notifications, voice/video, 2FA, app lock, recovery codes, backup/restore, Google Drive, permissions, feedback, policy and license.
- Inbox/history, realtime text, typing, receipts, reconnect sync, attachments, location/contact/poll/quiz/event/sticker sharing, view-once content, reply, reactions, edit, star/unstar, pin/unpin, delete, forwarding, scheduled/recurring/send-when-online messages and voice notes.
- WebRTC 1:1 calling and LiveKit group calling, incoming-call handling and native call UI integration.
- Android FCM message/call registration and iOS APNs/VoIP registration when the corresponding production build configuration is supplied.
- Offline session restoration/cache behavior and resilient realtime reconnect.

## Device E2EE

Private-chat text Device E2EE implements the web v1 envelope:

- ECDH P-256 device keys.
- HKDF-SHA256 key derivation.
- AES-256-GCM message/content-key encryption.
- Fresh ephemeral P-256 key material per target-device envelope.
- Session-scoped private key material in `flutter_secure_storage`; private keys are never uploaded.
- Device-key registration through `PUT /chat-v2/e2ee/device-key`.
- Peer key-directory lookup through `GET /chat-v2/e2ee/keys`.
- Room status/toggle through `/chat-v2/e2ee/rooms/:roomId`.
- Web-compatible Base64/Base64URL encoding.
- HTTP history, realtime inserts and reconnect-sync messages decrypted on device.
- Missing participant device keys fail closed without plaintext fallback.

The backend/web protocol still does not define encrypted media, encrypted scheduled-send, encrypted edit or encrypted forward operations. Flutter blocks those operations while Device E2EE is enabled instead of downgrading them to plaintext.

## Permission model

Normal app startup does not bulk-request camera, microphone, contacts, photos, location or Bluetooth permissions. Permissions are requested from the feature that needs them, while already-granted contact access may be used for silent address-book synchronization. Notification permission is exposed through the explicit notification/settings flow.

## Release configuration

Android release builds never fall back to the debug signing key. Production signing is supplied through:

- `SYNCCHAT_ANDROID_KEYSTORE_PATH`
- `SYNCCHAT_ANDROID_KEYSTORE_PASSWORD`
- `SYNCCHAT_ANDROID_KEY_ALIAS`
- `SYNCCHAT_ANDROID_KEY_PASSWORD`

iOS source includes push entitlements, VoIP/remote-notification background modes and the `syncchat://` URL scheme. Standard iOS Firebase/APNs registration can be configured without committing provider configuration files by supplying:

- `SYNCCHAT_FIREBASE_IOS_API_KEY`
- `SYNCCHAT_FIREBASE_IOS_APP_ID`
- `SYNCCHAT_FIREBASE_IOS_BUNDLE_ID`
- existing Firebase sender/project values

Apple signing/provisioning, APNs/PushKit credentials and provider secrets remain deployment secrets and are not committed to the repository.

## Validation

Flutter CI runs:

```bash
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```

Regression coverage includes crypto compatibility, authentication/session behavior, permissions, push contracts, offline outbox behavior, P0/P1 architecture resolution, live-shell parity and canonical privacy/notification settings contracts.

Physical-device/App Store/Play Store validation still depends on production signing identities, provider credentials and device/simulator infrastructure; those are release-environment requirements rather than missing Flutter feature surfaces.
