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

- [ ] Load `/api/calling/config` before creating `RTCPeerConnection`
- [ ] Replace hard-coded Google STUN configuration
- [ ] Apply DB-managed audio/video constraints
- [ ] Enforce global/audio/video/group feature switches
- [ ] Add call timeout and cancel state
- [ ] Add busy and missed-call states
- [ ] Add ICE restart and reconnect grace window
- [ ] Add front/back camera switching
- [ ] Add `RTCPeerConnection.getStats()` quality monitoring

## Phase 3 — Durable call state

- [ ] Add dedicated MongoDB call history model
- [ ] Use UUID call IDs separate from chat room IDs
- [ ] Move active call state from in-memory `Map` to Redis with TTL
- [ ] Track ringing/accepted/connected/rejected/missed/busy/failed/ended states
- [ ] Keep chat-visible call summaries while storing structured call history

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
