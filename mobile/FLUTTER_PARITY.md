# SyncChat Flutter parity status

The web client remains the product and protocol source of truth. Flutter surfaces should preserve the SyncChat visual language while using native mobile layout and the same backend contracts.

## Live functionality

The current Flutter client has live backend wiring for authentication/session restore, inboxes, contacts, status, communities, channels, profile, room history, realtime text messaging, receipts, reconnect sync, attachments, view-once media, reply, reactions, edits where supported, star/pin/delete, scheduled messaging, forwarding, and voice notes.

### Device E2EE

Private-chat text E2EE is now implemented with the same v1 envelope used by the web client:

- ECDH P-256 device keys.
- HKDF-SHA256 key derivation.
- AES-256-GCM message/content-key encryption.
- A fresh ephemeral P-256 key for each target device envelope.
- Session-scoped private key material stored with `flutter_secure_storage`; private keys are never uploaded.
- Public device-key registration through `PUT /chat-v2/e2ee/device-key`.
- Peer key-directory lookup through `GET /chat-v2/e2ee/keys`.
- Room status/toggle through `/chat-v2/e2ee/rooms/:roomId`.
- Standard Base64 for encrypted envelope byte fields and Base64URL for P-256 JWK coordinates, matching the web implementation.
- HTTP history, realtime `chat/insert`, and reconnect sync messages are decrypted on-device.
- The room security sheet can register the current device and enable/disable E2EE.
- Missing participant device keys fail closed; plaintext fallback is not used.

The backend does not currently define encrypted-media, encrypted scheduled-send, encrypted edit, or encrypted forward protocols. Flutter therefore blocks media/voice attachments, scheduled messages, editing, and forwarding while Device E2EE is enabled rather than downgrading those operations to plaintext.

## Validation

Flutter CI runs:

```bash
flutter pub get
flutter analyze --no-fatal-infos
flutter test
```

`mobile/test/e2ee_crypto_test.dart` validates P-256 key integrity, per-device envelope round trips, non-target-session rejection, and the web-compatible Base64 envelope encoding.

## Still pending native/runtime work

- Android and iOS platform runner/bootstrap files and production permission manifests.
- Device-level camera/microphone/notification/deep-link validation on Android and iOS hardware/simulators.
- Real audio/video/group calling runtime (WebRTC/LiveKit) and incoming-call integration.
- Native push registration/background notification handling.
- Native Google/Facebook sign-in.
- Encrypted media and other E2EE operations only after matching backend/web protocols exist.
