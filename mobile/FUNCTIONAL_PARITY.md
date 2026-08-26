# SyncChat Flutter Functional Parity

The web client is the behavioral source of truth. Flutter parity means live backend behavior, not only a visually similar screen.

## Live production path

The app boots through `SyncChatMobileApp` and the authenticated experience uses `LiveMobileShell`. Core live behavior includes:

- Auth/session restore, registration, password reset, QR/device login, social login and 2FA.
- Chats, contacts, status, communities, channels, calls and profile data.
- Archive, Lists, Starred messages and Media collections.
- Room history, realtime inserts, typing, receipts/read state and catch-up sync.
- Photo/video/camera/document upload, resumable upload, location, contact, poll/quiz, event and sticker sharing.
- Reply, edit, reactions, star, pin, delete-for-me/delete-for-everyone, forwarding and view-once content.
- Scheduled, recurring and send-when-online messages.
- Native voice-note capture/upload/playback.
- WebRTC private calls, LiveKit group calls, incoming-call UI and call moderation contracts.
- Private text Device E2EE with secure on-device key storage and fail-closed behavior.
- Web-equivalent Settings sections and security/account popups/dialogs.

## Security and privacy parity

The canonical privacy enum is shared with the backend: `everyone`, `my_contacts`, `nobody`. Legacy/mobile `contacts` values are normalized to `my_contacts` server-side to prevent a contacts-only choice from silently broadening to everyone.

While Device E2EE is enabled, media attachments, scheduled sends, edits and forwards remain blocked until a matching encrypted backend/web protocol exists. No plaintext downgrade is permitted.

## Native notification/call integration

- Android uses FCM registration and native incoming-call UI.
- iOS supports standard APNs registration plus VoIP token registration/CallKit when production Firebase/APNs configuration is supplied.
- The durable backend `callId` is preserved through push, native accept and WebRTC/LiveKit join.
- Permission prompts are feature-driven rather than bulk-requested at first authenticated render.

## Release gates

- Android production artifacts must use the release keystore environment variables; the Gradle release build does not use the debug signing key.
- iOS contains a source-controlled push entitlement file and `syncchat://` URL scheme; Apple signing/provisioning and provider credentials remain CI/release secrets.
- Flutter CI runs dependency resolution, analyzer and unit/widget/contract tests.
- Backend/frontend quality CI runs backend syntax/tests/audit and frontend production build/audit.

Store submission and physical-device validation require the real signing identities and provider credentials in the release environment; they are not represented as committed secrets.
