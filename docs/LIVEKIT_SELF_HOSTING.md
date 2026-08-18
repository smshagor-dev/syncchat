# SyncChat LiveKit SFU Deployment

This document covers the external media service required by Phase 5 group calling. SyncChat itself stores the LiveKit URL/API credentials in the MongoDB-backed **Admin > Calling & WebRTC** configuration; do not hard-code those credentials into frontend builds.

## Recommended topology

```text
syncchat.live              -> Vercel frontend
api.syncchat.live          -> SyncChat REST + Socket.IO backend
MongoDB Atlas              -> durable application/call history
Redis                      -> active call state + Socket.IO coordination
media.syncchat.live        -> dedicated LiveKit SFU host
turn/media TURN endpoint   -> LiveKit embedded TURN or separately managed TURN
```

Do not run the LiveKit media server inside a Vercel Function. Use a dedicated VM/container host with a public IP and predictable UDP/TCP networking.

## Self-hosted LiveKit

LiveKit's production VM guide uses Docker Compose and Caddy and supports HTTPS/WebSocket plus WebRTC and TURN. A standard production VM should have DNS pointing at the server and firewall access for the media ports actually enabled in the LiveKit configuration.

Common production ports with the default LiveKit VM layout:

- TCP 80: certificate issuance / HTTP redirect when using the generated Caddy setup.
- TCP 443: HTTPS/WebSocket and TURN/TLS in the generated VM setup.
- TCP 7881: WebRTC ICE/TCP fallback.
- UDP 3478: embedded TURN/UDP when enabled.
- UDP 50000-60000: default WebRTC ICE/UDP media range.
- LiveKit's internal API/WebSocket port 7880 is normally placed behind TLS termination rather than exposed directly.

LiveKit also supports an optional single UDP mux port instead of the large UDP range. Match the firewall to the actual LiveKit server configuration rather than opening unused ports.

## API key and secret

Create a strong LiveKit API key/secret pair in the LiveKit server configuration. The same pair is entered in SyncChat Admin so the backend can create short-lived participant JWTs.

Example LiveKit server concept:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  YOUR_API_KEY: YOUR_LONG_API_SECRET
turn:
  enabled: true
```

Keep the actual production secret outside source control. The example above is intentionally placeholder-only.

## SyncChat Admin configuration

Open:

```text
/admin/calling
```

Then configure:

1. Enable **Group calls**.
2. Enable **LiveKit SFU for larger group calls**.
3. Set **LiveKit URL**, for example `wss://media.syncchat.live`.
4. Enter the LiveKit **API key** and **API secret**.
5. Set **Use SFU from participants**. `3` is the recommended starting point for this implementation.
6. Raise **Max group participants** to the desired limit only after SFU is enabled.
7. Keep **Adaptive stream** enabled.
8. Keep **Dynacast** enabled.
9. Save, then run **Validate Calling Config**.

SyncChat encrypts the API secret before database storage using `CALL_CONFIG_SECRET`, falling back to `STORAGE_CONFIG_SECRET` or `JWT_SECRET`. Keep that encryption secret stable between deployments.

## Runtime flow

```text
Caller starts group call
        |
        v
SyncChat Socket.IO signaling
        |
        v
Redis durable call state + UUID callId
        |
        +--> PWA/native incoming-call notifications
        |
        v
Authenticated client asks /api/calling/session/:callId
        |
        +--> p2p  -> existing WebRTC runtime for small calls
        |
        `--> sfu  -> POST /api/calling/sfu-token
                         |
                         v
                  short-lived LiveKit JWT
                         |
                         v
                  LiveKit SFU room
```

The LiveKit room name is derived from the SyncChat server-generated `callId`. The authenticated SyncChat user UUID becomes the LiveKit participant identity.

## Security boundaries

- Never expose the LiveKit API secret to the browser or mobile client.
- Only authenticated SyncChat users listed in the durable call's participant set can obtain an SFU token.
- Users removed by the group-call host are denied new SFU tokens for the same call.
- Token TTL is admin configurable and bounded by the backend.
- The current host `remove` action is enforced by the official SyncChat client and prevents token re-entry. It does not yet invoke LiveKit RoomService to forcibly disconnect a deliberately modified/untrusted client that ignores the removal event. Add server-side RoomService removal before relying on moderation against hostile clients.

## Deployment validation

Before enabling SFU for production users, verify all of the following with real devices/networks:

- Admin validation resolves and reaches the LiveKit endpoint.
- Two-person P2P calls still work.
- A group at the configured SFU threshold receives `mediaMode=sfu`.
- Every participant receives a valid SFU token and joins the same room.
- Audio and video tracks publish and subscribe correctly.
- Camera switch, mute, speaker mute, reconnect, and active-speaker UI work.
- At least one test is performed from mobile data and one restrictive Wi-Fi network.
- TURN fallback is exercised, not merely DNS/TCP validation.
- Host mute/remove behavior is tested.
- Call history and Redis active state are finalized correctly after the last participant ends the call.

## Scaling notes

For a single-region first release, start with one appropriately sized LiveKit media VM and monitor CPU, packet loss, egress bandwidth, participant count, and reconnect rates. LiveKit production scaling is primarily constrained by CPU and network bandwidth. Multi-node LiveKit deployments use Redis for distributed coordination; that media-cluster Redis is conceptually separate from SyncChat's application call-state keys even if the operator chooses the same managed Redis service with isolated namespaces/credentials.
