# SyncChat Calling Improvement Plan

Branch: `agent/calling-improvement-db-admin`

## Goal

Move SyncChat calling from a basic WebRTC proof-of-concept to an admin-managed, production-oriented calling stack for 1-to-1 audio/video first, then scalable group calls.

## Phase 1 — DB-backed calling control plane

- [x] Global calling enable/disable
- [x] Audio/video/group feature toggles
- [x] Ringing and reconnect timing configuration
- [x] STUN/TURN URL configuration
- [x] Static TURN credentials with encrypted-at-rest secret storage
- [x] Coturn shared-secret mode with short-lived runtime credentials
- [x] ICE transport policy (`all` / `relay`)
- [x] Audio processing defaults
- [x] Video quality defaults
- [x] Admin ICE configuration validation
- [x] Authenticated runtime call configuration endpoint
- [x] Dedicated admin calling settings page

## Phase 2 — Runtime client integration

- [x] Load `/api/calling/config` before creating `RTCPeerConnection`
- [x] Replace hard-coded Google STUN configuration
- [x] Apply DB-managed audio/video constraints
- [x] Enforce global/audio/video/group feature switches
- [x] Add call timeout and cancel state
- [x] Add busy and missed-call states
- [x] Add ICE restart and reconnect grace window
- [x] Add front/back camera switching
- [x] Add `RTCPeerConnection.getStats()` quality monitoring

Phase 2 notes:
- Runtime ICE servers and TURN credentials now come from the authenticated DB-backed calling endpoint.
- Call start is rejected server-side when admin policy disables a call type or exceeds the group participant limit.
- One-to-one busy detection, ring timeout/missed handling, caller cancellation, and explicit call lifecycle events are now supported.
- WebRTC peers attempt ICE restart before cleanup when the network disconnects.
- Client quality sampling reports RTT, jitter, and packet-loss quality status in the call UI.

## Phase 3 — Durable call state

- [x] Add dedicated MongoDB call history model
- [x] Use UUID call IDs separate from chat room IDs
- [x] Move active call state from in-memory `Map` to Redis with TTL
- [x] Track ringing/accepted/connected/rejected/missed/busy/failed/ended states
- [x] Keep chat-visible call summaries while storing structured call history

Phase 3 notes:
- Every call attempt now receives a server-generated UUID `callId` independent of its chat `roomId`; the runtime client adopts that ID from `call/started` or `call/incoming` and propagates it through join, accept, reject, signal, reconnect, cancel, leave, and end events.
- Structured call history is stored in MongoDB with participants, joined/rejected/busy users, timestamps, duration, end reason, failure metadata, and a bounded status timeline.
- Active call ownership and busy state are stored in Redis under call, room, and user keys with TTL. Redis `NX` reservations reduce double-call races across backend instances. Production calling requires `REDIS_URL`; memory fallback is development-only.
- Socket disconnect no longer destroys the durable active-call record, allowing the reconnect grace flow from Phase 2 to rejoin the same call.
- Existing chat-visible call summaries remain for calls backed by a real chat inbox, while structured MongoDB history records all call attempts, including ad-hoc group call sessions.
- Ring timeout timers are best-effort runtime timers that re-read Redis before finalizing a missed call. The Redis state itself is durable across instances; a separate durable delayed-job/sweeper can be added later if strict timer execution across serverless freezes is required.

## Phase 4 — Background incoming calls

- [x] Wire durable call start to the existing Web Push `call` category
- [x] Add persistent PWA incoming-call notifications with Accept/Decline actions
- [x] Route PWA notification actions back into the existing call runtime when the app is open or launched from the notification
- [x] Add native push-device registration/unregistration API
- [x] Add FCM HTTP v1 high-priority incoming-call backend transport
- [x] Add APNs token-auth incoming-call backend transport, including PushKit VoIP topic support
- [ ] Wire Android app `FirebaseMessagingService` to the SyncChat call runtime and full-screen incoming-call UI
- [ ] Wire iOS app PushKit delivery to CallKit and the SyncChat call runtime

Phase 4 notes:
- Web/PWA, FCM, and APNs delivery are triggered only after the Redis durable active-call record exists, so all notification paths carry the canonical server-generated `callId`.
- Web notification preferences (`mute`, global push switch, and call notifications) are respected before delivery. Native call push uses the same user-level call-notification preference checks.
- PWA call actions preserve the call payload when focusing an existing tab or launching a closed PWA. Accept/Decline is bridged into the current call panel so it uses the same media permission, Socket.IO, Redis state, and WebRTC flow instead of a parallel call implementation.
- Android and iOS backend transports are ready but the native client repositories are not present in this repository. The remaining app-side work is documented in `docs/MOBILE_CALL_PUSH_INTEGRATION.md`.

## Phase 5 — Group calling scale

- [x] Replace P2P mesh for larger calls with an SFU path
- [x] Evaluate self-hosted LiveKit vs mediasoup and select LiveKit for the first production SFU integration
- [x] Add adaptive subscriptions / publishing optimization and group-call moderation

Phase 5 notes:
- SyncChat keeps the existing WebRTC P2P runtime for 1-to-1 and small group calls. Group calls above four participants are never allowed to fall back to mesh; the backend caps the effective limit at four unless the admin-managed SFU is enabled.
- LiveKit SFU settings are stored in the existing MongoDB-backed Calling & WebRTC admin configuration. The LiveKit API secret is AES-256-GCM encrypted using `CALL_CONFIG_SECRET` (falling back to the existing calling secret chain) and is never returned to browser clients.
- The admin can configure the LiveKit URL, API key, API secret, maximum group size, SFU threshold, short-lived token TTL, adaptive stream, and Dynacast. The admin validation endpoint checks the configured SFU hostname and TCP endpoint in addition to ICE validation.
- `POST /api/calling/sfu-token` issues a short-lived LiveKit room token only after authenticating the SyncChat user, loading the durable Redis call state, confirming the call is a group call, checking participant membership, and confirming the user was not removed by the host.
- `GET /api/calling/session/:callId` returns the canonical backend-selected media mode (`p2p` or `sfu`) so foreground socket calls, PWA-launched calls, and reconnects make the same media-routing decision.
- Each LiveKit room is derived from the server-generated SyncChat `callId`; the user UUID is the LiveKit participant identity. The browser never receives the LiveKit API secret.
- The group runtime uses LiveKit `adaptiveStream` and `dynacast`, renders remote participants as independent tiles, highlights active speakers, exposes connection quality/reconnect state, and supports microphone mute, camera toggle, front/back camera switching, and speaker muting.
- The SyncChat call initiator is treated as the host. Host moderation supports mute and remove events. Removed users are persisted in Redis call state and cannot obtain a new SFU token for that call. The current media-server eject is client-cooperative; an authoritative LiveKit RoomService remove-participant call can be added later if moderation must resist a modified/untrusted client.
- The browser SDK is pinned to LiveKit Client v2.21.0 through the browser UMD build to avoid dependency-lock churn in this branch. A later maintenance change may vendor/bundle the SDK instead of loading it from a CDN.
- A real LiveKit server or LiveKit Cloud project plus valid API credentials is still required for an end-to-end SFU media test. Repository build validation alone cannot prove external media allocation or TURN reachability.

## Security notes

TURN credential/shared-secret and LiveKit API-secret values are stored encrypted using `CALL_CONFIG_SECRET`, falling back to `STORAGE_CONFIG_SECRET` or `JWT_SECRET`. Admin GET responses expose only whether secrets are set. Coturn shared-secret mode generates temporary HMAC credentials for authenticated users and never sends the shared secret to clients.

Durable call state stores only call/session metadata in Redis and MongoDB. 1-to-1/small-call WebRTC media remains peer-to-peer/TURN-relayed; larger group media is routed by the configured LiveKit SFU. SyncChat does not persist call media in this calling state layer.

Web Push VAPID, FCM service-account, APNs provider, TURN, and LiveKit provider credentials are backend-only secrets and must never be embedded in browser, Android, or iOS client builds.
