# SyncChat Native Incoming Call Push Integration

This document covers the client-side work required to finish Phase 4 for native Android and iOS apps. The SyncChat backend already exposes native push-token registration and sends incoming-call payloads through FCM and APNs when credentials are configured.

## Backend registration API

All endpoints require the normal authenticated SyncChat access token.

### Register or refresh a native push token

`POST /api/settings/push/native/register`

Android example:

```json
{
  "platform": "android",
  "provider": "fcm",
  "token": "<firebase-registration-token>",
  "tokenType": "standard",
  "deviceId": "<stable-installation-id>",
  "deviceLabel": "Pixel 9",
  "appVersion": "1.0.0"
}
```

iOS VoIP example:

```json
{
  "platform": "ios",
  "provider": "apns",
  "token": "<pushkit-voip-token>",
  "tokenType": "voip",
  "deviceId": "<stable-installation-id>",
  "deviceLabel": "iPhone",
  "appVersion": "1.0.0"
}
```

Re-register whenever the OS refreshes the token. The backend deduplicates by a SHA-256 token hash and moves an existing token to the currently authenticated account.

### Unregister on logout or token invalidation

`DELETE /api/settings/push/native/unregister`

```json
{
  "token": "<current-token>"
}
```

or:

```json
{
  "deviceId": "<stable-installation-id>"
}
```

## Incoming call payload

The native payload uses string values so the same contract works with FCM data messages and APNs custom payload fields.

```json
{
  "type": "incoming_call",
  "callId": "<uuid>",
  "roomId": "<chat-room-id>",
  "roomType": "private",
  "mediaType": "audio",
  "fromUserId": "<caller-user-id>",
  "fromName": "Caller Name",
  "fromUsername": "caller",
  "ringingTimeoutSec": "45"
}
```

`callId` is the durable calling identifier and must be preserved for accept, join, reject, signal, reconnect, leave, cancel, and end events. Do not generate a replacement call ID on the native client.

For group calls, the native client should resolve the canonical media path after authentication:

`GET /api/calling/session/:callId`

The response returns `mediaMode=p2p` or `mediaMode=sfu`. When it returns `sfu`, request short-lived LiveKit join credentials with:

`POST /api/calling/sfu-token`

```json
{
  "callId": "<uuid>"
}
```

Do not infer P2P/SFU routing from participant counts stored in a push payload. The backend Redis call state and admin configuration are the source of truth.

## Android client work

The backend sends FCM HTTP v1 data messages with Android priority `high` and a TTL matching the ringing timeout.

The Android app should:

1. Obtain the Firebase registration token and register it with the backend.
2. Handle `type=incoming_call` in the app's Firebase messaging service.
3. Start the app's incoming-call flow immediately and display a call-style notification/full-screen incoming-call UI according to the Android SDK level and app permissions being targeted.
4. Preserve `callId` and the remaining payload fields when launching the call activity.
5. On **Answer**, connect the Socket.IO calling runtime, resolve `/api/calling/session/:callId`, and join the existing `callId` using P2P WebRTC or LiveKit according to the backend-selected media mode.
6. On **Decline**, emit the existing SyncChat reject flow for the same `callId`.
7. Refresh the backend registration whenever Firebase rotates the token, and unregister it on logout when appropriate.

Do not place Firebase service-account credentials in the Android app. The Firebase project ID, client email, and private key are configured by an administrator in SyncChat and stored server-side in MongoDB; the private key is encrypted at rest.

## iOS client work

For WhatsApp/Messenger-style incoming calls, register a PushKit VoIP token with `tokenType=voip`. The backend sends VoIP APNs pushes to `<bundle-id>.voip` when the APNs credentials are configured.

The iOS app should:

1. Register for PushKit VoIP pushes.
2. Send the PushKit token to `/api/settings/push/native/register` with `platform=ios`, `provider=apns`, and `tokenType=voip`.
3. When a VoIP push arrives, hand the incoming call to the app's CallKit provider immediately using the existing `callId` as the call/session identity.
4. On CallKit answer, open the SyncChat Socket.IO flow, resolve `/api/calling/session/:callId`, and join/accept the same `callId` using P2P WebRTC or LiveKit according to the backend-selected media mode.
5. On decline/end, emit the existing reject/end flow and finish the CallKit transaction.
6. Re-register whenever PushKit rotates the token.

Do not place the APNs `.p8` private key in the iOS app. Team ID, key ID, bundle ID, private key, and production/sandbox selection are configured by an administrator in SyncChat and stored server-side in MongoDB; the private key is encrypted at rest.

## Admin configuration

Native call-push provider credentials are configured from:

`/admin/calling-push`

The admin API is:

- `GET /api/admin/calling/native-push`
- `PATCH /api/admin/calling/native-push`

Android settings stored in MongoDB:

- enabled
- Firebase project ID
- Firebase client email
- encrypted Firebase private key

Apple settings stored in MongoDB:

- enabled
- APNs team ID
- APNs key ID
- app bundle ID
- encrypted `.p8` private key
- `production` or `sandbox` environment

Private keys are encrypted using `CALL_CONFIG_SECRET`, falling back to `STORAGE_CONFIG_SECRET` and then `JWT_SECRET`. Keep that encryption secret stable across deployments. Blank private-key fields in the admin UI preserve the currently stored encrypted key.

The old `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`, and `APNS_ENVIRONMENT` environment variables are no longer required for native call push.

Web/PWA push remains environment-backed:

```dotenv
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@syncchat.app
```

## Delivery behavior

Web/PWA push, Android FCM, and iOS APNs are sent in parallel after the durable call state has been created in Redis. User notification preferences are respected before push delivery. Expired web subscriptions and invalid native device tokens are removed automatically when the provider reports them as invalid.

Push is only the wake-up/ringing path. Call signaling/state still uses Socket.IO + Redis/MongoDB. One-to-one and small-call media uses the existing WebRTC + STUN/TURN path; larger group calls use the admin-configured LiveKit SFU path when the backend returns `mediaMode=sfu`.
