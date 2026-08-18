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

## Android client work

The backend sends FCM HTTP v1 data messages with Android priority `high` and a TTL matching the ringing timeout.

The Android app should:

1. Obtain the Firebase registration token and register it with the backend.
2. Handle `type=incoming_call` in the app's Firebase messaging service.
3. Start the app's incoming-call flow immediately and display a call-style notification/full-screen incoming-call UI according to the Android SDK level and app permissions being targeted.
4. Preserve `callId` and the remaining payload fields when launching the call activity.
5. On **Answer**, connect the Socket.IO/WebRTC calling runtime and join/accept the existing `callId`.
6. On **Decline**, emit the existing SyncChat reject flow for the same `callId`.
7. Refresh the backend registration whenever Firebase rotates the token, and unregister it on logout when appropriate.

Do not place Firebase service-account credentials in the Android app. `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` belong only on the backend.

## iOS client work

For WhatsApp/Messenger-style incoming calls, register a PushKit VoIP token with `tokenType=voip`. The backend sends VoIP APNs pushes to `<bundle-id>.voip` when the APNs credentials are configured.

The iOS app should:

1. Register for PushKit VoIP pushes.
2. Send the PushKit token to `/api/settings/push/native/register` with `platform=ios`, `provider=apns`, and `tokenType=voip`.
3. When a VoIP push arrives, hand the incoming call to the app's CallKit provider immediately using the existing `callId` as the call/session identity.
4. On CallKit answer, open the SyncChat Socket.IO/WebRTC flow and join/accept the same `callId`.
5. On decline/end, emit the existing reject/end flow and finish the CallKit transaction.
6. Re-register whenever PushKit rotates the token.

Do not place the APNs `.p8` private key in the iOS app. `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_BUNDLE_ID`, and `APNS_PRIVATE_KEY` belong only on the backend.

## Backend environment

```dotenv
# Web/PWA
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@syncchat.app

# Android FCM HTTP v1
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=

# iOS APNs token auth
APNS_TEAM_ID=
APNS_KEY_ID=
APNS_BUNDLE_ID=
APNS_PRIVATE_KEY=
APNS_ENVIRONMENT=sandbox
```

Private-key values may be stored with literal `\\n` sequences; the backend restores them to PEM newlines at runtime.

## Delivery behavior

Web/PWA push, Android FCM, and iOS APNs are sent in parallel after the durable call state has been created in Redis. User notification preferences are respected before push delivery. Expired web subscriptions and invalid native device tokens are removed automatically when the provider reports them as invalid.

Push is only the wake-up/ringing path. Audio/video media still uses the existing WebRTC + STUN/TURN runtime, and call signaling/state still uses Socket.IO + Redis/MongoDB.
