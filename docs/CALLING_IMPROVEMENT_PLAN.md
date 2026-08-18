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

- [ ] Wire call start to existing web-push call category
- [ ] Add service-worker incoming-call actions for PWA
- [ ] Add FCM/full-screen incoming call flow for Android app
- [ ] Add APNs/CallKit flow for iOS app

## Phase 5 — Group calling scale

- [ ] Replace P2P mesh for larger calls with an SFU
- [ ] Evaluate self-hosted LiveKit vs mediasoup
- [ ] Add adaptive subscriptions and group-call moderation

## Security notes

TURN credential/shared-secret values are stored encrypted using `CALL_CONFIG_SECRET`, falling back to `STORAGE_CONFIG_SECRET` or `JWT_SECRET`. Admin GET responses expose only whether secrets are set. Coturn shared-secret mode generates temporary HMAC credentials for authenticated users and never sends the shared secret to clients.

Durable call state stores only call/session metadata in Redis and MongoDB; WebRTC media remains peer-to-peer/TURN-relayed and is not persisted by this call-state layer.
